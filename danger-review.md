# Danger.js PR 审查使用与设置

本仓库使用 Danger.js 在 Pull Request 阶段检查确定性的仓库规范，例如内容目录、Frontmatter、课程引用和 PDF 配对。

该工具不会对文章内容进行审核与评价，只检查提交内容是否符合规范。

## 它是怎样工作的

PR 会触发两个互相独立的检查：

1. `Build / build` 在无写权限的普通 `pull_request` 环境中检出 PR，运行规则测试、完整仓库校验、`astro check` 和 `astro build`。
2. `PR Policy / danger` 使用默认分支中受信任的规则代码，通过 GitHub API 把 PR 文件作为数据读取，并更新一条 Danger 评论。

两处调用同一个规则引擎：`scripts/pr-policy/rules.mjs`。`dangerfile.js` 只负责将结果转换为 PR 评论。

## Contributor：提交前怎样检查

首次参与时安装依赖：

```bash
pnpm install
```

提交前依次运行：

```bash
pnpm run policy:test
pnpm run policy:check
pnpm run check
```

- `policy:test` 测试审查规则本身。
- `policy:check` 检查当前仓库全部内容。
- `check` 运行 `astro check` 和正式静态构建。

Danger 输出分为两种：

- `FAIL`：会阻止合并，必须修复。
- `WARN`：建议处理，但不会让工作流失败。

修复后继续 push 到同一个 PR 即可。Danger 会更新原有评论，不需要关闭并重开 PR。

### 爆阻断错误的问题参考

- 课程文件不是 `src/content/courses/{课程代码小写}.md`。
- 课程代码、目录名和 Frontmatter 不一致。
- 资源没有放在 `src/content/resources/{课程代码}/{贡献者目录}/{文件}.md`。
- 贡献者目录包含大写字母、中文或约定外字符。
- 缺少 Frontmatter，YAML 无法解析，必填字段为空，枚举或数据类型错误。
- `course` 引用了不存在的课程。
- `assessment.md`、`external.md` 的文件名和 `type` 不一致。
- `pdf` 含路径、扩展名错误、同目录文件不存在或大小写不一致。
- 删除仍被引用的课程或 PDF。
- Content Collection 目录中出现不支持的文件类型。

超过 10 MB 的 PDF 当前只产生警告。`public` 目录的资源建议使用 `author: Public`。

### 常见修复

贡献者目录必须全小写：

```text
错误：src/content/resources/elec327204/Shirakawa05/学习体验.md
正确：src/content/resources/elec327204/shirakawa05/学习体验.md
```

资源目录和课程字段必须对应：

```yaml
# src/content/resources/comp400727/alice/note.md
course: COMP400727
```

PDF 必须与 Markdown 同目录，且名称完全一致：

```yaml
pdf: 离散数学笔记.pdf
```

不要填写 `./离散数学笔记.pdf`、子目录或大小写不同的名称。

## For Repo owner：首次启用

### 1. 合并本地实现

`pull_request_target` 工作流使用默认分支中的工作流和 Dangerfile。因此，新增 Danger 的这次 PR 本身不会使用尚未合并的新版规则；合并后，后续 PR 才会正常触发。

需要合并的关键文件包括：

```text
dangerfile.js
scripts/pr-policy/
.github/workflows/danger.yml
.github/workflows/build.yml
package.json
pnpm-lock.yaml
```

### 2. 检查 Actions 权限

在仓库的 `Settings → Actions → General` 中确认组织或仓库策略没有禁止工作流申请 PR 写权限。工作流已经使用最小权限：

```yaml
permissions:
  contents: read
  pull-requests: write
```

不需要创建 Personal Access Token，不需要创建专用机器人账号，也不要把 PAT 添加到 fork PR 可访问的环境。

如果组织策略禁止 `pull-requests: write`，Danger 仍可作为只读检查运行，但不能发布评论；这时需要由组织管理员放开上述单项权限。

### 3. 配置 Ruleset 或分支保护

先让合并后的工作流至少成功运行一次，然后在 `Settings → Rules → Rulesets` 或 `Branches` 中保护 `main`，将以下检查设为 Required：

```text
Build / build
PR Policy / danger
```

不要随意更改 workflow 或 job 名称，否则 GitHub 会把它视为新的状态检查，需要重新选择。

建议同时要求：

- 合并前必须通过 Pull Request。
- 至少一名维护者批准。
- 对 `.github/workflows/`、`dangerfile.js` 和 `scripts/pr-policy/` 使用 CODEOWNERS。

CODEOWNERS 必须填写实际维护者或团队，例如：

```text
/.github/workflows/  @你的组织/维护团队
/dangerfile.js       @你的组织/维护团队
/scripts/pr-policy/  @你的组织/维护团队
```

### 4. 验证同仓库与 fork PR

分别建立两个测试 PR：

1. 正常内容 PR，确认两个检查都通过且 Danger 留下通过消息。
2. 使用大写贡献者目录或错误 Frontmatter 的 fork PR，确认 Danger 能评论且两个检查阻止合并。

测试完成后再把状态检查设为必需，可以避免错误配置直接锁住 `main`。

## 安全边界

`.github/workflows/danger.yml` 使用 `pull_request_target`，因为公开仓库的 fork PR 无法在普通 `pull_request` 工作流中获得评论写权限。这也意味着该工作流必须遵守以下规则：

- 只能检出 `github.event.pull_request.base.sha`。
- 不能检出、执行或导入 PR head 中的任何代码。
- 不能运行 PR 修改后的 `package.json`、Dangerfile、脚本或依赖。
- PR 文件只能通过 GitHub API读取并作为普通文本或文件元数据解析。
- 不要把 PR 标题、正文或文件内容直接拼接进 shell 命令。

普通 `Build` 工作流可以检出并构建 PR，但它只有 `contents: read`，不得加入 secrets 或写仓库权限。

## 修改规则

规则实现位于：

```text
scripts/pr-policy/rules.mjs
```

每次增加或修正规则时：

1. 在 `scripts/pr-policy/__tests__/` 添加有效和无效样例。
2. 运行 `pnpm run policy:test`。
3. 运行 `pnpm run policy:check`，确认现有仓库不会被误伤。
4. 更新本文档和 `CONTRIBUTING.md` 中对应规范。
5. 由维护者重点审查 Danger 工作流的权限和 checkout ref。

调整 PDF 阈值时，修改 `validateSnapshot` 的 `pdfWarnBytes` 默认值并补充测试。将警告升级为阻断时，应先观察真实 PR，确保不会误伤已有内容。

## 故障排查

### Danger 没有评论

- 确认 PR 不是 Draft；Draft 转为 Ready 后会触发。
- 查看 `PR Policy / danger` 日志。
- 确认工作流已存在于默认分支。
- 确认组织策略允许 `pull-requests: write`。
- 确认 fork PR 的工作流已获维护者运行许可。

### 本地通过，但 CI 失败

重点检查路径大小写。本地 Windows 文件系统通常不区分大小写，而 GitHub Actions 和 GitHub Pages 使用 Linux。重命名仅改变大小写时，可使用两步 `git mv`：

```bash
git mv Shirakawa05 temporary-name
git mv temporary-name shirakawa05
```

### Danger 通过，但 Astro 构建失败

Danger 只覆盖已经编码的仓库规则，Astro 构建仍是最终事实来源。

如果出现此类情况，请及时告知repo维护人员。维护人员会尽快把新的失败原因整理为测试，并加入规则引擎，防止同类问题再次进入构建阶段。
