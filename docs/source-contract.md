# 来源接口与资料语义

SFTP v3，仅使用授权测试账号。manifest.json 自带 batchId、revision、files(path,size,sha256)，清单正文 SHA 是领取身份。路径必须是普通文件且在 inbox 内，符号链接不跟随。OPEN 获取的句柄在当前连接内绑定内容；READ 可短读且回调乱序，只有 EOF 状态明确结束。断线使句柄失效，重新 OPEN 后必须重新证明文件与原清单一致。fixture 服务支持相同路径换对象、短读及读中断开，主机公钥按本地生成的固定信任值核对，不能关闭验证。

## 收件器扩展接口

现有 `src/intake.mjs` 导出 `preview(source, store)`，只做预览。收件器入口为新增的 `collect(source, store)`，由调用方负责创建和关闭来源及 Inbox。`npm run acceptance` 调用这一入口。返回的 `records` 是可正式交付资料，不把未确认片段放进该集合；特殊业务的 pending 和 diagnostics 独立返回。原始证据通过 Inbox 保存，正式记录应含证据引用。接口不规定内部架构，允许增加模块和持久表，但不能移除原预览或更改来源语义。

## 可观察边界

- OPEN 后同路径替换，原句柄仍指旧文件
- 多次短读与真正 EOF
- 断线后不盲接旧偏移
- 路径链接与临时文件不属于清单交付
- 新清单未闭合时旧批次仍可见

## 公开的结果字段

`acceptance/collection.test.mjs` 给出当前集成方使用的结果字段及最小示例，说明的是输出契约而非内部处理步骤。除这些示例外，以上来源语义也属于功能范围，不能靠场景名称分支返回固定答案。`status` 仅在对应资料闭合且可靠取得时为 complete。
