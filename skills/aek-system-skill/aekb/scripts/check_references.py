"""AEK Browser skill helpers — deterministic tasks the agent can run without loading content into context.

scripts/ 存放可执行代码，agent 按需调用，适合确定性的重复任务
（例如：核对 references/ 内部路径引用、检查 SKILL.md frontmatter）。

用法：python scripts/check_references.py [skills_root]
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


def find_skill_root() -> Path:
    """从脚本位置向上找到 aekb skill 包根目录。"""
    return Path(__file__).resolve().parents[1]


def list_reference_files(root: Path) -> list[Path]:
    return sorted(p for p in (root / "references").rglob("*.md") if p.is_file())


def check_internal_links(root: Path) -> list[str]:
    """扫描 references/ 中所有反引号包裹或 markdown 链接指向的 references/<...> 路径，
    确认它们确实存在，避免 agent 按文档去读一个不存在的文件。"""
    problems: list[str] = []
    ref_files = list_reference_files(root)
    for rf in ref_files:
        text = rf.read_text(encoding="utf-8")
        # 抓 `references/....md` 、 `../references/...` 、 [..](../../references/...)
        links = re.findall(r"`(references/[\w\-./]+\.md)`", text)
        links += re.findall(r"\]\(([^)]*references/[\w\-./]+\.md)\)", text)
        for link in links:
            # 统一成 aekb 根相对路径
            norm = link.replace("../", "")
            if norm.startswith("references/"):
                norm = norm[len("references/"):]
            if not (root / "references" / norm).exists():
                problems.append(f"{rf.relative_to(root)} -> {link} (missing {norm})")
    return problems


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else find_skill_root()
    if (root / "SKILL.md").exists() and (root / "references").is_dir():
        root = find_skill_root()
    print(f"skill root: {root}")
    print(f"reference files: {len(list_reference_files(root))}")
    problems = check_internal_links(root)
    if problems:
        print("BROKEN internal links:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("OK: internal reference links resolve")


if __name__ == "__main__":
    main()