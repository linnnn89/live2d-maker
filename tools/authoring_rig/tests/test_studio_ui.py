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
        self.playwright = sync_playwright().start()
        self.addCleanup(self.playwright.stop)
        self.browser = self.playwright.chromium.launch(headless=True)
        self.addCleanup(self.browser.close)
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 960})
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.route("**/*", self.route)

    def dispatch(self, operation, payload):
        if operation == "project-revisions":
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
