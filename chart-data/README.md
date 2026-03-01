# chart-data（原始数据）

## 推荐直接编辑

优先维护：`editable-data.js`  
首页和细分页会优先读取这份文本数据，适合在编辑器里直接查看和修改。

## Excel数据（可选）

你可以分开维护以下 Excel 表：

- `annotator-data.xlsx`：标注人员产量主数据
- `annotator-errors.xlsx`：标注人员错误类型明细
- `qc-data.xlsx`：质检人员主数据
- `qc-errors.xlsx`：质检人员错误类型明细

另外保留：
- `raw-data.xlsx`：主导入文件（建议）
- `dashboard-template.xlsx` / `dashboard-sample.xlsx`

## 字段说明

### 1) 标注人员产量表（annotator-data.xlsx）
- `任务ID` `任务名称` `任务状态`
- `任务总量` `每人每日目标`
- `日期`
- `标注员` `标注量`

### 2) 标注错误明细表（annotator-errors.xlsx）
- `任务ID` `日期`
- `标注错误人` `标注错误类型` `标注错误个数`

### 3) 质检人员主数据表（qc-data.xlsx）
- `任务ID` `任务名称` `任务状态`
- `任务总量` `质检人数`
- `日期`
- `质检员` `质检量` `质检错误个数`

### 4) 质检错误明细表（qc-errors.xlsx）
- `任务ID` `日期`
- `质检错误人` `质检错误类型` `质检错误个数`

## 导入方式

当前页面是“单文件导入”。

建议做法：
1. 把你维护的几张表放进同一个 Excel 工作簿（不同 sheet）。
2. 在页面点击 `导入数据(Excel优先)`，一次导入这个工作簿。

系统会按 `任务ID + 日期 + 人名` 自动匹配标注和质检错误数据。
