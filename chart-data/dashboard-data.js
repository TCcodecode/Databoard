(function () {
  const seedTasks = [
    {
      id: "cn_dialog_v2",
      name: "中文对话意图V2",
      status: "completed",
      total: 6200,
      targetPerPersonPerDay: 135,
      qcCount: 2,
      reviewers: ["质检A", "质检B"],
      annotators: ["林晨", "赵雨", "顾维", "宋柯"],
      base: 134
    },
    {
      id: "asr_error_tag",
      name: "ASR转写纠错标注",
      status: "completed",
      total: 5400,
      targetPerPersonPerDay: 118,
      qcCount: 2,
      reviewers: ["质检C", "质检D"],
      annotators: ["于航", "唐静", "高宁", "严松"],
      base: 117
    },
    {
      id: "mm_toxicity",
      name: "多模态风险内容识别",
      status: "completed",
      total: 6800,
      targetPerPersonPerDay: 142,
      qcCount: 2,
      reviewers: ["质检E", "质检F"],
      annotators: ["周慕", "许澄", "韩宇", "魏川"],
      base: 140
    },
    {
      id: "faq_rewrite",
      name: "客服FAQ改写数据",
      status: "ongoing",
      total: 9000,
      targetPerPersonPerDay: 128,
      qcCount: 2,
      reviewers: ["质检G", "质检H"],
      annotators: ["陆溪", "方祺", "潘越", "冯岚"],
      base: 123
    },
    {
      id: "ner_medical",
      name: "医疗实体识别NER",
      status: "ongoing",
      total: 12000,
      targetPerPersonPerDay: 152,
      qcCount: 2,
      reviewers: ["质检I", "质检J"],
      annotators: ["施远", "邵凡", "程佳", "吕珂"],
      base: 146
    },
    {
      id: "video_event",
      name: "视频事件切片标注",
      status: "ongoing",
      total: 15000,
      targetPerPersonPerDay: 170,
      qcCount: 2,
      reviewers: ["质检K", "质检L"],
      annotators: ["钱墨", "郑昕", "姜桐", "何羽"],
      base: 165
    }
  ];

  const seedDates = [
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-02-21",
    "2026-02-22",
    "2026-02-23",
    "2026-02-24",
    "2026-02-25",
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01"
  ];

  function createMockTasks(taskDefs, dates) {
    return taskDefs.map((task, taskIdx) => {
      const records = dates.map((date, dayIdx) => {
        const annotators = task.annotators.map((name, annIdx) => {
          const wave = ((dayIdx % 5) - 2) * 2;
          const step = (annIdx - 1.5) * 3;
          const drift = taskIdx * 2;
          const count = Math.max(80, task.base + wave + step + drift + (dayIdx % 3));

          const miss = dayIdx % 4 === annIdx % 4 ? 2 : 1;
          const wrong = (taskIdx + annIdx + dayIdx) % 5 === 0 ? 2 : 1;
          const ambiguity = dayIdx % 6 === annIdx % 3 ? 1 : 0;

          const errors = { 漏标: miss, 错标: wrong };
          if (ambiguity > 0) errors.歧义理解 = ambiguity;

          return { name, count, errors };
        });
        return { date, annotators };
      });

      const qcRecords = dates.map((date, dayIdx) => {
        const reviewers = (task.reviewers || []).map((name, revIdx) => {
          const baseCount = Math.max(70, Math.round(task.base * 0.9));
          const wave = ((dayIdx % 4) - 1.5) * 3;
          const step = revIdx * 6;
          const count = Math.max(60, baseCount + wave + step + (taskIdx % 3));
          const miss = (dayIdx + revIdx + taskIdx) % 4 === 0 ? 2 : 1;
          const wrong = (dayIdx + revIdx) % 5 === 0 ? 2 : 1;
          return {
            name,
            count,
            errorCount: miss + wrong,
            errors: { 漏检: miss, 误判: wrong }
          };
        });
        return { date, reviewers };
      });

      return {
        id: task.id,
        name: task.name,
        status: task.status,
        total: task.total,
        qcCount: task.qcCount || (task.reviewers || []).length,
        targetPerPersonPerDay: task.targetPerPersonPerDay,
        records,
        qcRecords
      };
    });
  }

  window.DASHBOARD_DATA = { tasks: createMockTasks(seedTasks, seedDates) };
})();
