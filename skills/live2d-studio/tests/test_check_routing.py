import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "check_routing.py"
SPEC = importlib.util.spec_from_file_location("check_routing", SCRIPT)
check_routing = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(check_routing)


class RoutingValidatorTests(unittest.TestCase):
    def setUp(self):
        check_routing.errors.clear()
        check_routing.warnings.clear()
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)

    def tearDown(self):
        self.tempdir.cleanup()

    def write(self, relative: str, content: str) -> dict[str, Path]:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return {f"skills/live2d-studio/{relative}": path}

    def test_l1_requires_ownership_completion_and_diagnostic_sections(self):
        files = self.write(
            "references/route-broken.md",
            "---\nname: route-broken\nlayer: L1\n---\n# broken\n",
        )

        check_routing.check_content_contracts(files)

        self.assertTrue(any("归我" in error for error in check_routing.errors))
        self.assertTrue(any("不归我" in error for error in check_routing.errors))
        self.assertTrue(any("完成判据" in error for error in check_routing.errors))
        self.assertTrue(any("诊断" in error for error in check_routing.errors))

    def test_skill_frontmatter_rejects_empty_license_and_tags(self):
        files = self.write(
            "SKILL.md",
            "---\nname: live2d-studio\ndescription: \"PSD/Live2D 路由入口。\"\n"
            "platforms: [windows]\nlicense:\nmetadata:\n  hermes:\n    tags: []\n---\n# body\n",
        )

        check_routing.check_frontmatter(files)

        self.assertTrue(any("license" in error and "非空" in error for error in check_routing.errors))
        self.assertTrue(any("tags" in error and "非空" in error for error in check_routing.errors))

    def test_lifecycle_owner_requires_model_generation_transition(self):
        files = self.write(
            "references/route-input-layering.md",
            "---\nname: route-input-layering\nlayer: L1\nnext_routes: []\n---\n"
            "# input\n**归我**：x\n**不归我**：y\n## 完成判据\npass\n## 诊断（回退锚）\nstop\n",
        )

        check_routing.check_content_contracts(files)

        self.assertTrue(any("model-generation" in error for error in check_routing.errors))


if __name__ == "__main__":
    unittest.main()
