# 上游来源与同步说明

本目录是第三方开源技能 **UI/UX Pro Max** 的 vendor 副本，为 he-calendar 提供**离线可用**的设计指导能力。

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| 上游路径 | `.claude/skills/ui-ux-pro-max/` |
| 引入版本 | v2.13.0 |
| 上游 commit | `09170eec67eefd46a7ae85de61b40c194020f997`（2026-09-27） |
| 引入日期 | 2026-09-30 |
| 许可证 | MIT，见同目录 `LICENSE`（Copyright (c) 2024 Next Level Builder） |
| 引入时星标 | 131,824 |

## 相对上游的改动

**仅一处**：`SKILL.md` 中 11 处示例命令的脚本路径。

- 上游写法：`${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py`
- 本仓库写法：`.agents/skills/ui-ux-pro-max/scripts/search.py`

原因：DSH 从项目级 `.agents/skills/<name>/SKILL.md` 发现技能，环境中不存在 `CLAUDE_PLUGIN_ROOT` 变量。

其余所有文件（`scripts/`、`data/`、`references/`）与上游该 commit 逐字节一致，未做修改。

## 运行依赖

仅需 Python 3.x，无第三方依赖。`scripts/core.py` 用 `DATA_DIR = Path(__file__).parent.parent / "data"` 定位数据，
故整个目录可整体搬移、无需固定工作目录。

## 更新方式

```bash
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git /tmp/uupm
cp -r /tmp/uupm/.claude/skills/ui-ux-pro-max/. .agents/skills/ui-ux-pro-max/
# 重新应用上述路径改写，并更新本文件的 commit / 版本 / 日期
```
