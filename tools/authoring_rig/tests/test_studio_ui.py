"""Real React flows against pure project use cases; an existing Vite server is required.

Run STUDIO_UI_URL=http://127.0.0.1:5173 python -m unittest
tools.authoring_rig.tests.test_studio_ui -v. No native rebuild or Windows CLI is used.
"""
import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from psd_tools import PSDImage
from playwright.sync_api import expect, sync_playwright

from tools.authoring_rig.projects import create_project, project_root, revision_list, save_project, restore_project
from tools.authoring_rig.studio import snapshot, save_workspace, save_build_settings
from tools.authoring_rig.studio_protocol import StudioError


@unittest.skipUnless(os.environ.get("STUDIO_UI_URL"), "Set STUDIO_UI_URL to an existing Vite server")
class StudioUi(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="studio-ui-")
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name)
        source = directory / "source.psd"
        psd = PSDImage.new("RGBA", (32, 32))
        psd.create_pixel_layer(Image.new("RGBA", (20, 20), (30, 80, 100, 255)), name="face", left=2, top=3)
        psd.save(source)
        catalog = directory / "projects"
        result = create_project(catalog, {"schemaVersion": 1, "kind": "psd", "name": "UI fixture",
                                          "data": base64.b64encode(source.read_bytes()).decode()})
        self.root = project_root(catalog, result["project"]["id"])
        self.initial = snapshot(self.root)
        self.requests = []
        self.errors = []
        self.fail_rebuild = False
        self.fail_revisions = 0
        self.playwright = sync_playwright().start()
        self.addCleanup(self.playwright.stop)
        self.browser = self.playwright.chromium.launch(headless=True)
        self.addCleanup(self.browser.close)
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 960})
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.route("**/*", self.route)

    def dispatch(self, operation, payload):
        if operation == "project-revisions":
            if self.fail_revisions:
                self.fail_revisions -= 1
                raise StudioError("WORKSPACE_FAILED", "Fixture revision read failed", "project")
            return revision_list(self.root)
        if operation == "project-save":
            return save_project(self.root, payload)
        if operation == "project-restore":
            return restore_project(self.root, payload)
        if operation == "save":
            return save_workspace(self.root, payload)
        if operation == "build-settings":
            return save_build_settings(self.root, payload)
        if operation == "rebuild" and self.fail_rebuild:
            raise StudioError("BUILD_FAILED", "Fixture rebuild failed after settings save", "build")
        if operation in ("open", "snapshot"):
            return snapshot(self.root)
        raise AssertionError(f"Unexpected fixture operation: {operation}")

    def route(self, route):
        path = urlparse(route.request.url).path
        if "/api/" in path:
            operation = path.split("/api/", 1)[1]
            self.requests.append(operation)
            try:
                value = self.dispatch(operation, route.request.post_data_json)
                status = 200
            except StudioError as error:
                status = 409 if error.detail["code"].endswith("CONFLICT") else 400
                value = {"schemaVersion": 1, "status": "error", "error": str(error), "detail": error.detail}
            route.fulfill(status=status, content_type="application/json", body=json.dumps(value))
        elif "/studio-files/" in path:
            file = self.root / path.split("/studio-files/", 1)[1]
            route.fulfill(status=200, content_type="image/png", body=file.read_bytes())
        else:
            route.continue_()

    def open(self):
        self.page.goto(os.environ["STUDIO_UI_URL"].rstrip("/") + "/?project=" + self.root.name)
        expect(self.page.get_by_role("button", name="Rebuild", exact=True)).to_be_enabled()
        self.assertIn("Studio", self.page.title())
        expect(self.page.locator("vite-error-overlay")).to_have_count(0)

    def settings(self):
        self.page.get_by_text("项目构建设置", exact=True).click()
        control = self.page.get_by_label("贴图尺寸", exact=True)
        expect(control).to_be_enabled()
        return control

    def remote_settings(self, atlas_size):
        view = snapshot(self.root)
        return save_build_settings(self.root, {"schemaVersion": 1, "revision": view["revision"],
            "settingsRevision": view["buildSettings"]["revision"],
            "settings": {**view["buildSettings"]["settings"], "atlasSize": atlas_size}})

    def edit_artwork(self, opacity):
        self.page.evaluate("""async opacity => {
            const read = await window.studioDraft.execute({schemaVersion:1, operation:'inspect'});
            const result = await window.studioDraft.execute({schemaVersion:1, operation:'apply',
                state:read.state, commands:[{type:'set_opacity', partId:read.state.ir.parts[0].id, opacity}]});
            if (!result.ok) throw new Error(JSON.stringify(result.error));
        }""", opacity)

    def evidence(self, name):
        directory = os.environ.get("STUDIO_UI_EVIDENCE_DIR")
        if directory:
            output = Path(directory)
            output.mkdir(parents=True, exist_ok=True)
            self.page.screenshot(path=str(output / (name + ".png")), full_page=True)

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def test_dirty_settings_survive_unrelated_save_conflict_and_refresh(self):
        self.open()
        control = self.settings()
        control.select_option("1024")
        self.remote_settings(4096)
        self.edit_artwork(160)
        self.page.get_by_role("button", name="保存 IR", exact=True).click()
        expect(self.page.get_by_text("IR 已保存", exact=True)).to_be_visible()
        expect(control).to_have_value("1024")
        expect(self.page.get_by_text("最新保存设置：4096px", exact=False)).to_be_visible()
        expect(self.page.locator(".build-settings summary")).to_contain_text("未保存")
        self.evidence("settings-conflict-desktop")
        self.page.get_by_role("button", name="保存设置", exact=True).click()
        expect(self.page.get_by_role("alert")).to_contain_text("Build settings changed in another editor")
        expect(control).to_have_value("1024")
        self.page.get_by_role("button", name="重新读取设置", exact=True).click()
        expect(self.page.get_by_text("已读取当前构建设置", exact=True)).to_be_visible()
        expect(control).to_have_value("1024")
        self.page.get_by_role("button", name="放弃设置修改", exact=True).click()
        expect(control).to_have_value("4096")
        expect(self.page.locator(".build-settings summary")).not_to_contain_text("未保存")

    def test_clean_settings_follow_server_and_successful_save_clears_pending(self):
        self.open()
        self.page.set_viewport_size({"width": 390, "height": 844})
        control = self.settings()
        self.remote_settings(1024)
        self.page.get_by_role("button", name="重新读取设置", exact=True).click()
        expect(control).to_have_value("1024")
        control.select_option("4096")
        self.page.get_by_role("button", name="保存设置", exact=True).click()
        expect(self.page.get_by_text("构建设置已保存；重建后采用", exact=True)).to_be_visible()
        expect(self.page.locator(".build-settings summary")).not_to_contain_text("未保存")
        self.assertEqual(snapshot(self.root)["buildSettings"]["settings"]["atlasSize"], 4096)
        self.evidence("settings-saved-mobile")

    def test_settings_save_is_committed_even_when_optional_rebuild_fails(self):
        self.open()
        control = self.settings()
        control.select_option("1024")
        self.fail_rebuild = True
        self.page.get_by_role("button", name="保存并重建", exact=True).click()
        expect(self.page.get_by_role("alert")).to_contain_text("Fixture rebuild failed")
        expect(control).to_have_value("1024")
        expect(self.page.locator(".build-settings summary")).not_to_contain_text("未保存")
        self.assertEqual(snapshot(self.root)["buildSettings"]["settings"]["atlasSize"], 1024)
        self.assertEqual(self.requests.count("build-settings"), 1)

    def project(self):
        self.page.get_by_text("工程保存与修订", exact=True).click()
        expect(self.page.get_by_role("button", name="保存项目修订", exact=True)).to_be_enabled()
        return self.page.locator(".project-panel")

    def save_revision(self, name):
        self.page.get_by_label("修订说明", exact=True).fill(name)
        self.page.get_by_role("button", name="保存项目修订", exact=True).click()
        row = self.page.locator(".project-panel li").filter(has_text=name)
        expect(row).to_contain_text("当前保存修订")
        return row

    def test_restore_current_head_restores_saved_artwork_and_lists_automatic_backup(self):
        changed = json.loads(json.dumps(self.initial["ir"]))
        changed["parts"][0]["appearance"]["opacity"] = 180
        save_workspace(self.root, {"revision": self.initial["revision"], "ir": changed})
        self.open()
        panel = self.project()
        panel.get_by_role("button", name="恢复此修订", exact=True).click()
        expect(panel.locator("li").filter(has_text="恢复前自动保存")).to_be_visible()
        expect(panel.locator("li").filter(has_text="导入 PSD")).to_contain_text("当前保存修订")
        self.assertEqual(snapshot(self.root)["ir"], self.initial["ir"])
        self.assertEqual(len(revision_list(self.root)["revisions"]), 2)

    def test_save_restore_save_keeps_head_and_revision_list_consistent(self):
        self.open()
        panel = self.project()
        self.save_revision("Revision B")
        expect(self.page.get_by_role("button", name="保存项目修订", exact=True)).to_be_enabled()
        panel.locator("li").filter(has_text="导入 PSD").get_by_role("button", name="恢复此修订").click()
        expect(panel.locator("li").filter(has_text="恢复前自动保存")).to_be_visible()
        expect(panel.locator("li").filter(has_text="导入 PSD")).to_contain_text("当前保存修订")
        expect(panel.locator("li").filter(has_text="Revision B")).not_to_contain_text("当前保存修订")
        self.save_revision("Revision C")
        current = revision_list(self.root)
        self.assertEqual(len(current["revisions"]), 4)
        self.assertEqual(next(r["message"] for r in current["revisions"] if r["id"] == current["head"]), "Revision C")
        self.evidence("project-restored-and-resaved-desktop")

    def test_restore_success_read_failure_retries_only_the_read(self):
        self.open()
        panel = self.project()
        self.fail_revisions = 1
        panel.get_by_role("button", name="恢复此修订", exact=True).click()
        expect(self.page.get_by_text("已恢复修订；恢复前状态保留为新修订", exact=True)).to_be_visible()
        expect(panel.get_by_role("alert")).to_contain_text("已完成的工程操作仍然有效")
        expect(self.page.get_by_role("button", name="保存项目修订", exact=True)).to_be_disabled()
        self.assertEqual(len(revision_list(self.root)["revisions"]), 2)
        panel.get_by_role("button", name="读取修订记录", exact=True).click()
        expect(panel.locator("li").filter(has_text="恢复前自动保存")).to_be_visible()
        expect(panel.get_by_role("alert")).to_have_count(0)
        self.assertEqual(self.requests.count("project-restore"), 1)
        self.assertEqual(self.requests.count("project-revisions"), 3)
        self.assertEqual(len(revision_list(self.root)["revisions"]), 2)

    def test_external_project_head_conflict_preserves_input_until_explicit_read(self):
        self.open()
        panel = self.project()
        current = snapshot(self.root)
        save_project(self.root, {"schemaVersion": 1, "revision": current["revision"],
            "settingsRevision": current["buildSettings"]["revision"], "head": current["project"]["head"], "message": "Other page"})
        self.page.get_by_label("修订说明", exact=True).fill("My pending revision")
        panel.get_by_role("button", name="保存项目修订", exact=True).click()
        expect(self.page.get_by_role("alert")).to_contain_text("Saved project head changed")
        expect(self.page.get_by_label("修订说明", exact=True)).to_have_value("My pending revision")
        panel.get_by_role("button", name="读取修订记录", exact=True).click()
        expect(panel.locator("li").filter(has_text="Other page")).to_contain_text("当前保存修订")
        panel.get_by_role("button", name="保存项目修订", exact=True).click()
        expect(panel.locator("li").filter(has_text="My pending revision")).to_contain_text("当前保存修订")
        self.assertEqual(len(revision_list(self.root)["revisions"]), 3)

    def test_strict_mode_cleanup_closes_old_bridge_and_worker_without_breaking_remount(self):
        self.page.route("**/lifecycle-harness?*", lambda route: route.fulfill(
            content_type="text/html", body='<title>Live2D Studio Lifecycle</title><div id="host"></div>'))
        self.page.goto(os.environ["STUDIO_UI_URL"].rstrip("/") + "/lifecycle-harness?project=" + self.root.name)
        self.page.evaluate("""async () => {
            // Use Vite's exact React module URLs, including its version query, to share one dispatcher.
            const contextSource = await (await fetch('/src/workspace/WorkspaceContext.tsx')).text();
            const mainSource = await (await fetch('/src/main.tsx')).text();
            const react = (await import(contextSource.match(/from \"([^\"]*react\\.js[^\"]*)\"/)[1])).default;
            const dom = (await import(mainSource.match(/from \"([^\"]*react-dom_client\\.js[^\"]*)\"/)[1])).default;
            const {WorkspaceProvider, useWorkspace} = await import('/src/workspace/WorkspaceContext.tsx');
            function Probe() {
                const workspace = useWorkspace();
                react.useEffect(() => { window.currentWorkspace = workspace; }, [workspace]);
                return react.createElement('p', null, workspace.saved ? '工作区已载入' : '正在载入');
            }
            window.mountHost = () => {
                window.hostRoot = dom.createRoot(document.getElementById('host'));
                window.hostRoot.render(react.createElement(react.StrictMode, null,
                    react.createElement(WorkspaceProvider, null, react.createElement(Probe))));
            };
            window.mountHost();
        }""")
        expect(self.page.get_by_text("工作区已载入", exact=True)).to_be_visible()
        result = self.page.evaluate("""async () => {
            window.oldBridge = window.studioDraft;
            window.oldClient = window.currentWorkspace.artwork;
            const read = await oldBridge.execute({schemaVersion:1, operation:'inspect'});
            const image = await oldBridge.capture({schemaVersion:1, state:read.state});
            window.oldToken = read.state;
            return {read:read.ok, capture:image.ok, png:image.ok && image.image.dataUrl.startsWith('data:image/png;base64,')};
        }""")
        self.assertEqual(result, {"read": True, "capture": True, "png": True})
        self.page.evaluate("window.hostRoot.unmount()")
        expect(self.page.get_by_text("工作区已载入", exact=True)).to_have_count(0)
        self.assertTrue(self.page.evaluate("window.studioDraft === undefined"))
        closed = self.page.evaluate("""async () => ({
            read:(await oldBridge.execute({schemaVersion:1, operation:'inspect'})).error.code,
            capture:(await oldBridge.capture({schemaVersion:1, state:oldToken})).error.code,
            client:await oldClient.render(oldToken.ir).then(() => 'accepted', error => error.code)
        })""")
        self.assertEqual(closed, {"read": "ABORTED", "capture": "ABORTED", "client": "ABORTED"})
        self.page.evaluate("window.mountHost()")
        expect(self.page.get_by_text("工作区已载入", exact=True)).to_be_visible()
        result = self.page.evaluate("""async () => {
            const read = await studioDraft.execute({schemaVersion:1, operation:'inspect'});
            const image = await studioDraft.capture({schemaVersion:1, state:read.state});
            const old = await oldBridge.execute({schemaVersion:1, operation:'apply', state:oldToken,
                commands:[{type:'set_opacity', partId:oldToken.ir.parts[0].id, opacity:80}]});
            return {capture:image.ok, old:old.error.code, dirty:currentWorkspace.dirty};
        }""")
        self.assertEqual(result, {"capture": True, "old": "ABORTED", "dirty": False})
        expect(self.page.locator("vite-error-overlay")).to_have_count(0)
        self.assertIn("Studio", self.page.title())
        self.assertFalse(self.errors)
        self.evidence("strict-mode-reopened-host")
        self.page.evaluate("window.hostRoot.unmount()")
