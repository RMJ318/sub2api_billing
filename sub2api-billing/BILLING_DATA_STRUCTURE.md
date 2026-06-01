# sub2api 月度账单数据结构说明

本文档说明 /home/hx/sub2api-billing/YYYY-MM/ 目录下每月自动生成的账单文件结构、字段含义、关联方式，以及未来做可视化平台时建议观测的数据指标。

## 1. 账单生成规则

每月计划任务执行后，会生成上个月的账单目录，例如：

~~~text
/home/hx/sub2api-billing/2026-05/
~~~

同时会生成压缩包：

~~~text
/home/hx/sub2api-billing/sub2api-billing-2026-05.tar.gz
~~~

当前月度结算脚本路径：

~~~text
/home/hx/tools/sub2api_monthly_billing_and_reset.sh
~~~

当前只导出账单脚本路径：

~~~text
/home/hx/tools/sub2api_export_monthly_bill.sh
~~~

账单数据主要来源于 sub2api Postgres 数据库中的：

~~~text
public.usage_logs
~~~

核心费用统计字段为：

~~~text
total_cost
~~~

默认每人每月额度上限：

~~~text
1000 USD
~~~

月度结算脚本会先导出账单，再保存余额重置审计记录，最后把普通用户额度重置为 1000 美元。

## 2. 文件总览

每个月账单目录下通常包含以下文件：

~~~text
monthly_user_summary.csv
月度用户使用汇总。一行代表一个用户当月整体用量。主账单表，最适合作为可视化首页和用户列表数据源。

daily_user_usage.csv
每日用户用量明细。一行代表一个用户在某一天的汇总用量。适合趋势图和异常峰值分析。

model_user_usage.csv
模型用量明细。一行代表一个用户在某个模型上的月度汇总。适合模型消费占比和模型成本分析。

api_key_usage.csv
API Key 用量明细。一行代表一个用户某个 API Key 的月度汇总。不会导出真实 API Key，只导出 Key ID 和名称。

request_detail.csv
请求级明细。一行代表一次请求。数据量最大，适合审计、排查异常请求和定位高成本调用。

balance_reset_audit.csv
余额重置前审计。一行代表一个用户在额度重置前的余额快照。

balance_after_reset.csv
余额重置后确认。一行代表一个用户在额度重置后的余额确认。

README.txt
账单目录的简要说明。
~~~

## 3. 表之间的关联方式

建议可视化平台使用以下字段进行关联：

~~~text
billing_month
账单月份。所有 CSV 都会带有该字段或可从目录名推导。

user_id
用户主键。用于关联用户月度汇总、每日用量、模型用量、API Key 用量、请求明细和余额重置记录。

api_key_id
API Key 主键。用于关联 api_key_usage.csv 和 request_detail.csv。

model
模型名称。用于聚合模型维度的消费、请求量和 token。

usage_date
使用日期。用于 daily_user_usage.csv 的趋势分析。

request_id
请求 ID。用于 request_detail.csv 中定位具体请求。
~~~

推荐数据关系：

~~~text
monthly_user_summary.csv
  -> user_id + billing_month -> daily_user_usage.csv
  -> user_id + billing_month -> model_user_usage.csv
  -> user_id + billing_month -> api_key_usage.csv
  -> user_id + billing_month -> request_detail.csv
  -> user_id + billing_month -> balance_reset_audit.csv
  -> user_id + billing_month -> balance_after_reset.csv
~~~

## 4. monthly_user_summary.csv

这是主账单表，一行代表一个用户在某个月的总使用情况。

建议作为可视化平台的用户列表、用户排行、月度结算页面主数据源。

主要字段：

~~~text
billing_month
账单月份，例如 2026-05。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

wechat
用户微信。

notes
用户备注。

role
用户角色，例如 user 或 admin。

status
用户状态，例如 active。

current_balance_usd
导出账单时用户当前余额。

monthly_limit_usd
本月额度上限，默认 1000。

used_usd
本月已使用金额，来自 usage_logs.total_cost 汇总。

remaining_monthly_limit_usd
按 monthly_limit_usd - used_usd 计算出的理论剩余额度。

usage_percent
额度使用百分比，used_usd / monthly_limit_usd * 100。

request_count
本月请求次数。

api_key_count
本月实际产生请求的 API Key 数量。

active_days
本月有请求的天数。

input_tokens
输入 token 总量。

output_tokens
输出 token 总量。

cache_creation_tokens
缓存写入 token 总量。

cache_read_tokens
缓存读取 token 总量。

image_output_tokens
图片输出 token 总量。

image_count
图片请求或图片数量汇总。

input_cost_usd
输入 token 成本。

output_cost_usd
输出 token 成本。

cache_creation_cost_usd
缓存写入成本。

cache_read_cost_usd
缓存读取成本。

image_output_cost_usd
图片输出成本。

actual_cost_usd
实际成本字段汇总，当前通常与 total_cost 接近，具体以系统计费逻辑为准。

avg_duration_ms
平均请求耗时，毫秒。

avg_first_token_ms
平均首 token 时间，毫秒。

first_request_at
本月首次请求时间。

last_request_at
本月最后请求时间。
~~~

适合做的图表和分析：

~~~text
用户消费排行榜
每人额度使用率
每人剩余额度
用户消费占总消费比例
活跃用户数
沉默用户列表
高消耗用户预警
额度使用超过 80% 或 90% 的用户
人均消费
人均请求次数
平均单次请求成本
~~~

## 5. daily_user_usage.csv

这是每日用量表，一行代表一个用户在某一天的汇总使用情况。

主要字段：

~~~text
billing_month
账单月份。

usage_date
使用日期。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

request_count
当天请求次数。

used_usd
当天消费金额。

input_tokens
当天输入 token。

output_tokens
当天输出 token。

cache_read_tokens
当天缓存读取 token。

image_output_tokens
当天图片输出 token。

avg_duration_ms
当天平均请求耗时。
~~~

适合做的图表和分析：

~~~text
每日总消费趋势
每日请求次数趋势
每日活跃用户数
每个用户的日消费曲线
用户月内累计消费曲线
单日消费突增检测
工作日和周末使用差异
月底额度消耗预测
~~~

## 6. model_user_usage.csv

这是模型维度账单表，一行代表一个用户在某个模型上的月度汇总。

主要字段：

~~~text
billing_month
账单月份。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

model
模型名称。

request_count
该用户本月调用该模型的次数。

used_usd
该用户本月在该模型上的消费金额。

input_tokens
该模型输入 token。

output_tokens
该模型输出 token。

cache_creation_tokens
该模型缓存写入 token。

cache_read_tokens
该模型缓存读取 token。

image_output_tokens
该模型图片输出 token。

avg_duration_ms
该模型平均请求耗时。
~~~

适合做的图表和分析：

~~~text
模型消费占比
模型请求量占比
高成本模型排行
每个用户最常用模型
每个用户最烧钱模型
模型平均单次请求成本
模型平均耗时排行
不同模型输入输出 token 比例
~~~

## 7. api_key_usage.csv

这是 API Key 维度账单表，一行代表一个用户某个 API Key 的月度汇总。

注意：该文件不会导出真实 API Key，只会导出 API Key ID 和名称，适合用于项目或应用维度的成本分摊。

主要字段：

~~~text
billing_month
账单月份。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

api_key_id
API Key ID。

api_key_name
API Key 名称。

api_key_status
API Key 状态。

api_key_deleted
API Key 是否已删除。

request_count
该 API Key 本月请求次数。

used_usd
该 API Key 本月消费金额。

input_tokens
该 API Key 输入 token。

output_tokens
该 API Key 输出 token。

first_request_at
该 API Key 本月首次请求时间。

last_request_at
该 API Key 本月最后请求时间。
~~~

适合做的图表和分析：

~~~text
按 API Key 分摊成本
识别异常 API Key
同一用户多个项目的成本占比
已删除 API Key 是否仍有历史消耗
长期未使用 API Key 列表
高请求量 API Key 排行
~~~

## 8. request_detail.csv

这是请求级明细表，一行代表一次请求，数据量最大。

建议可视化平台默认不要一次性加载全部明细，可以按月份、用户、模型、API Key、时间范围分页查询或导入数据库后再查询。

主要字段：

~~~text
billing_month
账单月份。

created_at
请求时间。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

api_key_id
API Key ID。

api_key_name
API Key 名称。

request_id
请求 ID。

model
模型名称。

inbound_endpoint
用户请求进入 sub2api 的接口路径。

upstream_endpoint
sub2api 转发到上游的接口路径。

input_tokens
本次请求输入 token。

output_tokens
本次请求输出 token。

cache_creation_tokens
本次请求缓存写入 token。

cache_read_tokens
本次请求缓存读取 token。

image_output_tokens
本次请求图片输出 token。

image_count
本次请求图片数量。

total_cost_usd
本次请求总费用。

actual_cost_usd
本次请求实际成本。

duration_ms
本次请求总耗时，毫秒。

first_token_ms
首 token 时间，毫秒。

stream
是否为流式请求。

ip_address
请求来源 IP。

user_agent
请求客户端 User-Agent。
~~~

适合做的图表和分析：

~~~text
高成本请求排行
慢请求排行
单次请求 token 异常
按 IP 查看异常调用
按 User-Agent 查看客户端来源
按 endpoint 查看接口使用情况
定位某个 request_id 的请求详情
流式请求与非流式请求对比
~~~

## 9. balance_reset_audit.csv

这是额度重置前的审计表，一行代表一个被重置用户在重置前的余额快照。

主要字段：

~~~text
reset_at
重置执行时间。

billing_month
本次结算的账单月份。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

wechat
用户微信。

notes
用户备注。

role
用户角色。

status
用户状态。

old_balance_usd
重置前余额。

new_balance_usd
准备重置到的余额，默认 1000。
~~~

适合做的图表和分析：

~~~text
重置前余额核对
用户余额争议追溯
确认哪些用户参与了本次重置
查看重置前是否有余额异常
~~~

## 10. balance_after_reset.csv

这是额度重置后的确认表，一行代表一个被重置用户在重置后的余额状态。

主要字段：

~~~text
checked_at
检查时间。

user_id
用户 ID。

email
用户邮箱。

username
用户名。

role
用户角色。

status
用户状态。

balance_usd
重置后的余额。

updated_at
用户记录更新时间。
~~~

适合做的图表和分析：

~~~text
确认是否全部成功重置为 1000
发现未重置或重置失败用户
每月额度重置审计
~~~

## 11. 可视化平台推荐页面

建议 MVP 先做 3 个页面：

~~~text
1. 首页总览
展示本月总消费、总请求数、活跃用户数、人均消费、总额度、剩余额度、额度使用率、Top 消费用户、Top 消费模型。

2. 用户明细
展示每个用户的消费、额度使用率、剩余额度、请求次数、活跃天数、token 明细、日趋势、模型分布、API Key 分布。

3. 请求审计
支持按用户、模型、API Key、IP、时间范围筛选 request_detail.csv，定位高成本请求、慢请求和异常来源。
~~~

后续可以扩展：

~~~text
模型分析页面
API Key 成本分摊页面
异常告警页面
额度重置审计页面
月度对比页面
~~~

## 12. 推荐观测指标

全局指标：

~~~text
本月总消费
本月总请求数
本月活跃用户数
本月人均消费
本月总额度
本月剩余额度
整体额度使用率
平均单次请求成本
平均请求耗时
平均首 token 时间
~~~

用户指标：

~~~text
每人消费金额
每人消费占比
每人额度使用率
每人剩余额度
每人请求次数
每人活跃天数
每人平均单次请求成本
每人输入 token
每人输出 token
每人缓存 token
每人图片输出 token
~~~

趋势指标：

~~~text
每日总消费趋势
每日请求数趋势
每日活跃用户趋势
每日平均单次请求成本
每日平均耗时
用户月内累计消费曲线
预计月底消费金额
~~~

模型指标：

~~~text
模型消费占比
模型请求量占比
模型平均单次成本
模型输入 token 总量
模型输出 token 总量
模型缓存命中相关 token
模型平均耗时
每个用户最常用模型
每个用户最烧钱模型
~~~

API Key 指标：

~~~text
API Key 消费排行
API Key 请求次数排行
API Key 平均单次成本
API Key 最近使用时间
异常高消费 API Key
长期未使用 API Key
已删除 API Key 的历史消耗
~~~

异常指标：

~~~text
额度使用超过 80% 的用户
额度使用超过 90% 的用户
单日消费突增用户
单次请求成本过高
单次请求 token 过高
请求耗时过长
某个 IP 请求过多
某个 User-Agent 请求异常
某个 API Key 突然高频调用
~~~

审计指标：

~~~text
账单是否成功生成
余额是否成功重置
参与重置的用户数量
重置前余额
重置后余额
未参与重置用户
重置失败用户
~~~

## 13. 给可视化平台的实现建议

建议不要直接在前端解析所有大 CSV，尤其是 request_detail.csv 可能会越来越大。

推荐方式：

~~~text
1. 后端定期扫描 /home/hx/sub2api-billing/YYYY-MM/ 目录。
2. 将 CSV 导入 SQLite、Postgres 或 DuckDB。
3. 前端通过 API 查询聚合后的数据。
4. request_detail.csv 做分页、筛选、排序，不要一次性全量返回。
5. monthly_user_summary.csv 可以作为首页和用户列表的主表。
6. daily_user_usage.csv 用于趋势图。
7. model_user_usage.csv 用于模型饼图、排行和成本拆分。
8. api_key_usage.csv 用于项目或 Key 维度成本分摊。
~~~

推荐图表类型：

~~~text
总览卡片：总消费、请求数、活跃用户、额度使用率
柱状图：用户消费排行、模型消费排行、API Key 消费排行
折线图：每日消费趋势、每日请求趋势、用户累计消费趋势
饼图或环图：用户消费占比、模型消费占比
表格：用户账单明细、请求审计明细、重置审计明细
热力图：用户每日活跃情况
散点图：请求成本 vs 请求耗时，定位高成本慢请求
~~~

## 14. 建议的告警规则

可视化平台后续可以增加告警：

~~~text
用户额度使用率 >= 80%：提醒关注。
用户额度使用率 >= 90%：高优先级提醒。
用户单日消费超过本人月额度 20%：疑似异常。
单次请求费用超过指定阈值：记录高成本请求。
单个 API Key 一天内请求数突增：疑似脚本异常。
同一 IP 多用户高频请求：疑似共享或异常调用。
请求平均耗时持续升高：可能是上游或网络异常。
~~~

## 15. 备注

当前账单统计的是 sub2api 记录的用量和成本，适合内部额度管理、用户用量排行、账单审计和异常排查。

如果未来平台正式对外计费，建议额外加入：

~~~text
账单确认状态
人工调整记录
充值记录
退款记录
发票或结算编号
每月账单锁定机制
管理员操作日志
~~~
