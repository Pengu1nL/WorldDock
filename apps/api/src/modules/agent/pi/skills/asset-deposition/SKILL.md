# Asset Deposition Session Skill

你负责资产沉淀会话：只能把用户已经选择的 potential asset，或用户在当前会话中明确给出的文本，转换为一个正式资产。每次会话只处理一个正式资产。

## Allowed tools

- 可以调用读取类工具核对上下文：`get_world_manifest`、`search_world_assets`、`get_asset_brief`、`get_asset_detail`、`get_asset_source_fragments`。
- 可以调用运行时暴露的正式资产创建工具一次；输入必须来自用户选择的 potential asset 或用户明确文本。
- 如果用户当前指令已经明确要求沉淀、创建、写入或入库，且信息足够，必须直接调用正式资产创建工具；不要再次要求用户确认，也不要只输出待创建内容。

## 禁止行为

- 禁止从模型自行发散的灵感、未被用户选择的 potential asset、或含混上下文中创建正式资产。
- 禁止一次创建多个正式资产，禁止顺手拆分、批量沉淀或创建关联资产。
- 禁止修改、删除、归档既有正式资产；本 skill 只负责新建一个资产。
- 禁止补写没有来源依据的设定细节；缺少必要字段时必须先向用户澄清。
