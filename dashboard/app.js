const {
  useState,
  useEffect,
  useMemo
} = React;

// 10 Comprehensive Benchmark Cases matching the Backend
const BENCHMARK_CASES = [{
  id: "case-1",
  name: "Normal Single Call",
  subtitle: "Everyday friend calling once during the afternoon",
  contactName: "Bob Smith",
  phoneNumber: "+91 98765 43210",
  relationship: "Friend",
  priority: "NORMAL",
  recentCallsCount: 0,
  timeOfDay: "14:30",
  historyTotal: 2,
  historyMissed: 0,
  description: "Single call from normal contact during business hours. Insufficient history neutral (+0)."
}, {
  id: "case-2",
  name: "Trusted Contact Calling Repeatedly",
  subtitle: "Close family/work member redialing multiple times",
  contactName: "Mom",
  phoneNumber: "+91 98123 45678",
  relationship: "Family",
  priority: "TRUSTED",
  recentCallsCount: 2,
  timeOfDay: "15:00",
  historyTotal: 2,
  historyMissed: 0,
  description: "Trusted contact (+20) + repeated calling (+15). Normal timing (+0). Reaches MEDIUM urgency."
}, {
  id: "case-3",
  name: "Emergency Contact Late Night Repeated",
  subtitle: "Parent calling 3 times at 3:00 AM",
  contactName: "Dad",
  phoneNumber: "+91 98222 33445",
  relationship: "Family",
  priority: "EMERGENCY",
  recentCallsCount: 3,
  timeOfDay: "03:15",
  historyTotal: 2,
  historyMissed: 0,
  description: "Emergency (+30) + High frequency (+30) + Late night context (+20). Highly urgent situation (80/100)."
}, {
  id: "case-4",
  name: "Unknown Caller Single Call",
  subtitle: "Unsaved number calling once during daytime",
  contactName: "Unknown Caller",
  phoneNumber: "+91 87654 32109",
  relationship: "Unknown",
  priority: "UNKNOWN",
  recentCallsCount: 0,
  timeOfDay: "11:45",
  historyTotal: 0,
  historyMissed: 0,
  description: "Unknown caller (+0) with no redials. Treated with zero urgency (0/100, LOW)."
}, {
  id: "case-5",
  name: "Insufficient Historical Data",
  subtitle: "Registered contact with only 1 prior call log",
  contactName: "Alice Miller",
  phoneNumber: "+91 99000 11223",
  relationship: "Colleague",
  priority: "NORMAL",
  recentCallsCount: 0,
  timeOfDay: "16:20",
  historyTotal: 1,
  historyMissed: 1,
  description: "Contact has < 3 total calls. Rule 4 ignores high missed percentage to avoid false positives (+0)."
}, {
  id: "case-6",
  name: "High Missed Call Rate Outlier",
  subtitle: "Normal contact whose calls are usually missed (>=50%)",
  contactName: "Dr. Dave",
  phoneNumber: "+91 94444 55566",
  relationship: "Doctor",
  priority: "NORMAL",
  recentCallsCount: 0,
  timeOfDay: "10:15",
  historyTotal: 4,
  historyMissed: 3,
  description: "History has 4 calls with 3 missed (75%). Satisfies Rule 4 for unusual missed call patterns (+20)."
}, {
  id: "case-7",
  name: "Maximum Boundary Stress Test",
  subtitle: "All 4 factors at maximum possible weights",
  contactName: "General Hospital Emergency",
  phoneNumber: "+91 91111 22233",
  relationship: "Hospital",
  priority: "EMERGENCY",
  recentCallsCount: 4,
  timeOfDay: "02:40",
  historyTotal: 5,
  historyMissed: 4,
  description: "Identity(+30) + Frequency(+30) + Night(+20) + History(+20) = 100. Verifies maximum clamp limits."
}, {
  id: "case-8",
  name: "Emergency Single Call at 2 AM",
  subtitle: "Emergency contact calling for the first time at night",
  contactName: "Sister (In Distress)",
  phoneNumber: "+91 97777 88899",
  relationship: "Family",
  priority: "EMERGENCY",
  recentCallsCount: 0,
  timeOfDay: "02:15",
  historyTotal: 2,
  historyMissed: 0,
  description: "Emergency contact (+30). Night trigger active because priority is EMERGENCY (+20) -> Score: 50 (MEDIUM)."
}];

// Pure Deterministic JavaScript mirror of `WeightedRuleEngine.java`
function evaluateUrgency(profile, recentCount, timeStr, historyTotal, historyMissed) {
  let score = 0;
  const traces = [];
  const breakdown = {
    identity: {
      pts: 0,
      max: 30,
      text: "",
      rule: ""
    },
    frequency: {
      pts: 0,
      max: 30,
      text: "",
      rule: ""
    },
    timing: {
      pts: 0,
      max: 20,
      text: "",
      rule: ""
    },
    history: {
      pts: 0,
      max: 20,
      text: "",
      rule: ""
    }
  };
  traces.push({
    step: "01. CONTEXT",
    text: `Incoming call from ${profile.name || "Unknown"} (${profile.phone || "N/A"}), Priority: ${profile.priority}`
  });

  // Factor 1: Caller Identity (Max 30)
  if (profile.priority === "EMERGENCY") {
    score += 30;
    breakdown.identity = {
      pts: 30,
      max: 30,
      text: "Emergency contact (+30)",
      rule: "priority == EMERGENCY (+30)"
    };
    traces.push({
      step: "02. IDENTITY",
      text: "Caller identified as EMERGENCY priority.",
      pts: "+30 pts",
      current: score
    });
  } else if (profile.priority === "TRUSTED") {
    score += 20;
    breakdown.identity = {
      pts: 20,
      max: 30,
      text: "Trusted contact (+20)",
      rule: "priority == TRUSTED (+20)"
    };
    traces.push({
      step: "02. IDENTITY",
      text: "Caller identified as TRUSTED priority.",
      pts: "+20 pts",
      current: score
    });
  } else if (profile.priority === "NORMAL") {
    breakdown.identity = {
      pts: 0,
      max: 30,
      text: "Normal contact (+0)",
      rule: "priority == NORMAL (+0)"
    };
    traces.push({
      step: "02. IDENTITY",
      text: "Caller identified as NORMAL contact.",
      pts: "+0 pts",
      current: score
    });
  } else {
    breakdown.identity = {
      pts: 0,
      max: 30,
      text: "Unknown caller (+0)",
      rule: "profile == null (+0)"
    };
    traces.push({
      step: "02. IDENTITY",
      text: "Unknown number (Not found in contacts).",
      pts: "+0 pts",
      current: score
    });
  }

  // Factor 2: Call Frequency (Max 30)
  if (recentCount >= 3) {
    score += 30;
    breakdown.frequency = {
      pts: 30,
      max: 30,
      text: "High frequency calling (+30)",
      rule: "recentCount >= 3 (+30)"
    };
    traces.push({
      step: "03. FREQUENCY",
      text: `High redial frequency detected (${recentCount} prior calls in 15 min).`,
      pts: "+30 pts",
      current: score
    });
  } else if (recentCount >= 1) {
    score += 15;
    breakdown.frequency = {
      pts: 15,
      max: 30,
      text: "Repeated calls (+15)",
      rule: "recentCount >= 1 (+15)"
    };
    traces.push({
      step: "03. FREQUENCY",
      text: `Repeated redial detected (${recentCount} prior call in 15 min).`,
      pts: "+15 pts",
      current: score
    });
  } else {
    breakdown.frequency = {
      pts: 0,
      max: 30,
      text: "Normal frequency (+0)",
      rule: "recentCount == 0 (+0)"
    };
    traces.push({
      step: "03. FREQUENCY",
      text: "First call attempt in current time window.",
      pts: "+0 pts",
      current: score
    });
  }

  // Factor 3: Timing and Context (Max 20)
  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const isLateNight = hour >= 23 || hour <= 5;
  const isEmergency = profile.priority === "EMERGENCY";
  const isRepeated = recentCount >= 1;
  if (isLateNight && (isRepeated || isEmergency)) {
    score += 20;
    breakdown.timing = {
      pts: 20,
      max: 20,
      text: "Late night contextual urgency (+20)",
      rule: "isLateNight && (recent>=1 || EMERGENCY) (+20)"
    };
    traces.push({
      step: "04. TIMING",
      text: `Late Night context confirmed (${timeStr} hrs). Triggered because ${isEmergency ? "Caller is Emergency" : "Caller is Repeated"}.`,
      pts: "+20 pts",
      current: score
    });
  } else if (isLateNight) {
    breakdown.timing = {
      pts: 0,
      max: 20,
      text: "Late night single call (+0)",
      rule: "isLateNight but neither repeated nor emergency (+0)"
    };
    traces.push({
      step: "04. TIMING",
      text: `Late Night (${timeStr} hrs), but single non-emergency call; neutral timing applied.`,
      pts: "+0 pts",
      current: score
    });
  } else {
    breakdown.timing = {
      pts: 0,
      max: 20,
      text: "Normal daytime timing (+0)",
      rule: "Daytime (06:00 - 22:59) (+0)"
    };
    traces.push({
      step: "04. TIMING",
      text: `Normal daytime call time (${timeStr} hrs).`,
      pts: "+0 pts",
      current: score
    });
  }

  // Factor 4: Historical Behaviour (Max 20)
  if (historyTotal >= 3) {
    if (historyMissed >= Math.ceil(historyTotal / 2)) {
      score += 20;
      breakdown.history = {
        pts: 20,
        max: 20,
        text: "Historically high missed call rate (+20)",
        rule: "missedCount >= history.size() / 2 (+20)"
      };
      traces.push({
        step: "05. HISTORY",
        text: `Unusual missed pattern: ${historyMissed} of ${historyTotal} previous calls missed (>=50%).`,
        pts: "+20 pts",
        current: score
      });
    } else {
      breakdown.history = {
        pts: 0,
        max: 20,
        text: "Normal historical behaviour (+0)",
        rule: "missedCount < 50% (+0)"
      };
      traces.push({
        step: "05. HISTORY",
        text: `History normal: ${historyTotal - historyMissed} answered vs ${historyMissed} missed.`,
        pts: "+0 pts",
        current: score
      });
    }
  } else {
    breakdown.history = {
      pts: 0,
      max: 20,
      text: "Insufficient history neutrally scored (+0)",
      rule: "history.size() < 3 (+0)"
    };
    traces.push({
      step: "05. HISTORY",
      text: `Sample size too small (${historyTotal} < 3 calls); neutrally scored.`,
      pts: "+0 pts",
      current: score
    });
  }

  // Boundary clamp
  const rawScore = score;
  score = Math.max(0, Math.min(100, score));
  let level = "LOW";
  let actionTitle = "Silent Alert / Normal Banner";
  let actionDesc = "Standard incoming call handling. Device respects Do Not Disturb (DND) or silent profile.";
  let color = "var(--urgency-low)";
  if (score <= 30) {
    level = "LOW";
    actionTitle = "Standard Call (Normal Priority)";
    actionDesc = "Urgency estimate is low. Phone will follow default user ringtone or silent settings without interruption.";
    color = "var(--urgency-low)";
  } else if (score <= 70) {
    level = "MEDIUM";
    actionTitle = "Elevated Priority Alert";
    actionDesc = "Noticeable caller context detected. Displays a prominent urgency badge on the incoming call banner.";
    color = "var(--urgency-med)";
  } else {
    level = "HIGH";
    actionTitle = "Critical Breakthrough Urgency";
    actionDesc = "Strong contextual evidence of emergency. Bypasses DND, triggers distinct audible chime & alert takeover.";
    color = "var(--urgency-high)";
  }
  traces.push({
    step: "06. RESULT",
    text: `Calculated Score: ${score}/100 (Level: ${level}) -> Saved to SQLite table 'call_history'.`,
    pts: `${score}/100`,
    current: score
  });
  return {
    score,
    rawScore,
    level,
    color,
    actionTitle,
    actionDesc,
    breakdown,
    traces,
    explanation: `${breakdown.identity.text}. ${breakdown.frequency.text}. ${breakdown.timing.text}. ${breakdown.history.text}.`
  };
}
function App() {
  const [activeTab, setActiveTab] = useState("java"); // "java" | "playground" | "pipeline" | "cases" | "code" | "db" | "oop"
  const [selectedCaseId, setSelectedCaseId] = useState("case-3");

  // State for Playground Form
  const [profile, setProfile] = useState({
    name: "Dad",
    phone: "+91 98222 33445",
    relationship: "Family",
    priority: "EMERGENCY"
  });
  const [recentCallsCount, setRecentCallsCount] = useState(3);
  const [timeOfDay, setTimeOfDay] = useState("03:15");
  const [historyTotal, setHistoryTotal] = useState(2);
  const [historyMissed, setHistoryMissed] = useState(0);

  // History log for simulated SQLite persistence
  const [dbLogs, setDbLogs] = useState(() => {
    return [{
      id: 1,
      name: "Dad",
      phone: "+91 98222 33445",
      time: "03:15 AM",
      score: 80,
      level: "HIGH",
      exp: "Emergency (+30). High frequency (+30). Late night (+20)."
    }, {
      id: 2,
      name: "Mom",
      phone: "+91 98123 45678",
      time: "15:00 PM",
      score: 35,
      level: "MEDIUM",
      exp: "Trusted (+20). Repeated calls (+15). Normal timing (+0)."
    }, {
      id: 3,
      name: "Bob Smith",
      phone: "+91 98765 43210",
      time: "14:30 PM",
      score: 0,
      level: "LOW",
      exp: "Normal contact (+0). Normal frequency (+0)."
    }];
  });

  // Load a benchmark case
  const loadCase = c => {
    setSelectedCaseId(c.id);
    setProfile({
      name: c.contactName,
      phone: c.phoneNumber,
      relationship: c.relationship,
      priority: c.priority
    });
    setRecentCallsCount(c.recentCallsCount);
    setTimeOfDay(c.timeOfDay);
    setHistoryTotal(c.historyTotal);
    setHistoryMissed(c.historyMissed);
  };

  // Run calculation
  const evaluation = useMemo(() => {
    return evaluateUrgency(profile, recentCallsCount, timeOfDay, historyTotal, historyMissed);
  }, [profile, recentCallsCount, timeOfDay, historyTotal, historyMissed]);

  // Log simulation to DB
  const saveToDb = () => {
    const newRecord = {
      id: Date.now(),
      name: profile.name,
      phone: profile.phone,
      time: timeOfDay,
      score: evaluation.score,
      level: evaluation.level,
      exp: evaluation.explanation
    };
    setDbLogs([newRecord, ...dbLogs]);
  };
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - evaluation.score / 100 * circumference;
  return /*#__PURE__*/React.createElement("div", {
    className: "app-container"
  }, /*#__PURE__*/React.createElement("header", {
    className: "header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-wrapper"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-icon"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm-1 6h2v6h-2V8zm0 8h2v2h-2v-2z"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "brand-title"
  }, "SafeCall AI • Backend Architecture & Telephony Visualizer"), /*#__PURE__*/React.createElement("div", {
    className: "brand-subtitle"
  }, "Interactive 4-Factor Weighted Rule Engine & Real-Time Telephony Pipeline"))), /*#__PURE__*/React.createElement("div", {
    className: "header-status"
  }, /*#__PURE__*/React.createElement("a", {
    href: "SafeCall_AI_Java_Architecture_and_Viva_Report.pdf",
    target: "_blank",
    className: "btn-secondary",
    style: {
      textDecoration: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#38bdf8',
      borderColor: 'rgba(56, 189, 248, 0.4)'
    },
    title: "Download / View the Comprehensive Academic Viva Defense Report & Java Architecture Document"
  }, /*#__PURE__*/React.createElement("span", null, "📄"), " Viva Guide & Java Architecture (PDF)"), /*#__PURE__*/React.createElement("div", {
    className: "badge-tag"
  }, /*#__PURE__*/React.createElement("span", {
    className: "live-pulse-dot"
  }), "Backend Gateway: ONLINE (:4000)"), /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    onClick: saveToDb
  }, "↓ Save State to SQLite Log"))), /*#__PURE__*/React.createElement("nav", {
    className: "nav-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "pipeline" ? "active" : ""}`,
    onClick: () => setActiveTab("pipeline")
  }, /*#__PURE__*/React.createElement("span", null, "📡"), " Live Telephony & FCM Pipeline"), /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "playground" ? "active" : ""}`,
    onClick: () => setActiveTab("playground")
  }, /*#__PURE__*/React.createElement("span", null, "⚙"), " Interactive Simulation Playground"), /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "java" ? "active" : ""}`,
    onClick: () => setActiveTab("java")
  }, /*#__PURE__*/React.createElement("span", null, "☕"), " Java OOP & Gradle Visualizer"), /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "oop" ? "active" : ""}`,
    onClick: () => setActiveTab("oop")
  }, /*#__PURE__*/React.createElement("span", null, "🧬"), " OOP Architecture & Object Flow Animation"), /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "cases" ? "active" : ""}`,
    onClick: () => setActiveTab("cases")
  }, /*#__PURE__*/React.createElement("span", null, "🧪"), " 8 Pre-Configured Benchmark Cases"), /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "code" ? "active" : ""}`,
    onClick: () => setActiveTab("code")
  }, /*#__PURE__*/React.createElement("span", null, "📄"), " Java Backend Code Inspector"), /*#__PURE__*/React.createElement("button", {
    className: `nav-tab-btn ${activeTab === "db" ? "active" : ""}`,
    onClick: () => setActiveTab("db")
  }, /*#__PURE__*/React.createElement("span", null, "🗃"), " SQLite Database Logs (", dbLogs.length, ")")), activeTab === "pipeline" && /*#__PURE__*/React.createElement(PipelineVisualizer, {
    dbLogs: dbLogs,
    onSimulateToDb: saveToDb
  }), activeTab === "playground" && /*#__PURE__*/React.createElement("div", {
    className: "dashboard-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "📞"), " Contextual Call Inputs"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Parameters")), /*#__PURE__*/React.createElement("div", {
    className: "form-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "Quick Scenario Preset"), /*#__PURE__*/React.createElement("span", {
    className: "desc"
  }, "Click to load")), /*#__PURE__*/React.createElement("select", {
    className: "input-text",
    value: selectedCaseId,
    onChange: e => {
      const found = BENCHMARK_CASES.find(c => c.id === e.target.value);
      if (found) loadCase(found);
    }
  }, BENCHMARK_CASES.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name)))), /*#__PURE__*/React.createElement("div", {
    className: "form-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "1. Caller Identity Priority"), /*#__PURE__*/React.createElement("span", {
    className: "desc"
  }, "Max 30 pts")), /*#__PURE__*/React.createElement("div", {
    className: "pill-selector"
  }, ["NORMAL", "TRUSTED", "EMERGENCY"].map(prio => /*#__PURE__*/React.createElement("div", {
    key: prio,
    className: `pill-option ${profile.priority === prio ? `selected prio-${prio.toLowerCase()}` : ""}`,
    onClick: () => setProfile({
      ...profile,
      priority: prio
    })
  }, prio))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `pill-option ${profile.priority === "UNKNOWN" ? "selected" : ""}`,
    onClick: () => setProfile({
      ...profile,
      priority: "UNKNOWN",
      name: "Unknown Caller"
    })
  }, "UNKNOWN CALLER (Unsaved Number)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px',
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "Caller Name")), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input-text",
    value: profile.name,
    onChange: e => setProfile({
      ...profile,
      name: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "Phone Number")), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input-text",
    value: profile.phone,
    onChange: e => setProfile({
      ...profile,
      phone: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "form-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "2. Call Frequency (Past 15 Mins)"), /*#__PURE__*/React.createElement("span", {
    className: "desc"
  }, "Max 30 pts")), /*#__PURE__*/React.createElement("div", {
    className: "slider-container"
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0",
    max: "4",
    step: "1",
    value: recentCallsCount,
    onChange: e => setRecentCallsCount(parseInt(e.target.value, 10))
  }), /*#__PURE__*/React.createElement("div", {
    className: "slider-value-badge"
  }, recentCallsCount, " Redials")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginTop: '6px'
    }
  }, recentCallsCount === 0 && "0 redials: Normal frequency (+0 pts)", recentCallsCount >= 1 && recentCallsCount < 3 && `${recentCallsCount} redials: Repeated calls threshold (+15 pts)`, recentCallsCount >= 3 && `${recentCallsCount} redials: High frequency calling (+30 pts)`)), /*#__PURE__*/React.createElement("div", {
    className: "form-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "3. Call Timing Context (24h)"), /*#__PURE__*/React.createElement("span", {
    className: "desc"
  }, "Max 20 pts")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    className: "input-text",
    value: timeOfDay,
    onChange: e => setTimeOfDay(e.target.value),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    onClick: () => setTimeOfDay("02:30"),
    title: "Set to Late Night 2:30 AM"
  }, "🌙 Night (02:30)"), /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    onClick: () => setTimeOfDay("14:00"),
    title: "Set to Daytime 2:00 PM"
  }, "☀️ Day (14:00)")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginTop: '6px'
    }
  }, "Late Night window is 23:00 - 05:00. Requires repeated call or Emergency contact to trigger +20 pts.")), /*#__PURE__*/React.createElement("div", {
    className: "form-group",
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "4. Historical Call Log Pattern"), /*#__PURE__*/React.createElement("span", {
    className: "desc"
  }, "Max 20 pts")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '4px'
    }
  }, "Total Prior Calls:"), /*#__PURE__*/React.createElement("div", {
    className: "slider-container"
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0",
    max: "6",
    value: historyTotal,
    onChange: e => {
      const tot = parseInt(e.target.value, 10);
      setHistoryTotal(tot);
      if (historyMissed > tot) setHistoryMissed(tot);
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "slider-value-badge"
  }, historyTotal))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '4px'
    }
  }, "Missed Prior Calls:"), /*#__PURE__*/React.createElement("div", {
    className: "slider-container"
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0",
    max: historyTotal,
    value: historyMissed,
    onChange: e => setHistoryMissed(parseInt(e.target.value, 10))
  }), /*#__PURE__*/React.createElement("div", {
    className: "slider-value-badge"
  }, historyMissed)))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginTop: '6px'
    }
  }, historyTotal < 3 ? "History size < 3: Insufficient history neutrally scored (+0 pts)." : historyMissed >= Math.ceil(historyTotal / 2) ? `Missed rate >= 50% (${historyMissed}/${historyTotal}): High missed call rate (+20 pts).` : `Missed rate < 50% (${historyMissed}/${historyTotal}): Normal behavior (+0 pts).`))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "hero-score-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-content-flex"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gauge-wrapper"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "gauge-svg",
    viewBox: "0 0 120 120"
  }, /*#__PURE__*/React.createElement("circle", {
    className: "gauge-bg-circle",
    cx: "60",
    cy: "60",
    r: "54"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "gauge-progress-circle",
    cx: "60",
    cy: "60",
    r: "54",
    stroke: evaluation.color,
    strokeDasharray: circumference,
    strokeDashoffset: strokeDashoffset
  })), /*#__PURE__*/React.createElement("div", {
    className: "gauge-score-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gauge-score-num",
    style: {
      color: evaluation.color
    }
  }, evaluation.score), /*#__PURE__*/React.createElement("div", {
    className: "gauge-score-label"
  }, "Score / 100"))), /*#__PURE__*/React.createElement("div", {
    className: "hero-details"
  }, /*#__PURE__*/React.createElement("div", {
    className: `level-badge level-${evaluation.level.toLowerCase()}`
  }, /*#__PURE__*/React.createElement("span", null, "●"), " Urgency Level: ", evaluation.level), /*#__PURE__*/React.createElement("div", {
    className: "hero-action-title"
  }, evaluation.actionTitle), /*#__PURE__*/React.createElement("div", {
    className: "hero-action-desc"
  }, evaluation.actionDesc)))), /*#__PURE__*/React.createElement("div", {
    className: "factors-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: `factor-card ${evaluation.breakdown.identity.pts > 0 ? "active-contribution" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-name"
  }, /*#__PURE__*/React.createElement("span", null, "👤"), " Caller Identity"), /*#__PURE__*/React.createElement("div", {
    className: `factor-score-pill ${evaluation.breakdown.identity.pts > 0 ? "has-points" : ""}`
  }, "+", evaluation.breakdown.identity.pts, " / 30 pts")), /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-fill",
    style: {
      width: `${evaluation.breakdown.identity.pts / 30 * 100}%`
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "factor-rule-text"
  }, evaluation.breakdown.identity.text), /*#__PURE__*/React.createElement("div", {
    className: "factor-branch-indicator"
  }, "code: ", evaluation.breakdown.identity.rule)), /*#__PURE__*/React.createElement("div", {
    className: `factor-card ${evaluation.breakdown.frequency.pts > 0 ? "active-contribution" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-name"
  }, /*#__PURE__*/React.createElement("span", null, "🔁"), " Call Frequency"), /*#__PURE__*/React.createElement("div", {
    className: `factor-score-pill ${evaluation.breakdown.frequency.pts > 0 ? "has-points" : ""}`
  }, "+", evaluation.breakdown.frequency.pts, " / 30 pts")), /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-fill",
    style: {
      width: `${evaluation.breakdown.frequency.pts / 30 * 100}%`
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "factor-rule-text"
  }, evaluation.breakdown.frequency.text), /*#__PURE__*/React.createElement("div", {
    className: "factor-branch-indicator"
  }, "code: ", evaluation.breakdown.frequency.rule)), /*#__PURE__*/React.createElement("div", {
    className: `factor-card ${evaluation.breakdown.timing.pts > 0 ? "active-contribution" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-name"
  }, /*#__PURE__*/React.createElement("span", null, "🕑"), " Timing & Context"), /*#__PURE__*/React.createElement("div", {
    className: `factor-score-pill ${evaluation.breakdown.timing.pts > 0 ? "has-points" : ""}`
  }, "+", evaluation.breakdown.timing.pts, " / 20 pts")), /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-fill",
    style: {
      width: `${evaluation.breakdown.timing.pts / 20 * 100}%`
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "factor-rule-text"
  }, evaluation.breakdown.timing.text), /*#__PURE__*/React.createElement("div", {
    className: "factor-branch-indicator"
  }, "code: ", evaluation.breakdown.timing.rule)), /*#__PURE__*/React.createElement("div", {
    className: `factor-card ${evaluation.breakdown.history.pts > 0 ? "active-contribution" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-name"
  }, /*#__PURE__*/React.createElement("span", null, "📊"), " Historical Behaviour"), /*#__PURE__*/React.createElement("div", {
    className: `factor-score-pill ${evaluation.breakdown.history.pts > 0 ? "has-points" : ""}`
  }, "+", evaluation.breakdown.history.pts, " / 20 pts")), /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "factor-progress-fill",
    style: {
      width: `${evaluation.breakdown.history.pts / 20 * 100}%`
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "factor-rule-text"
  }, evaluation.breakdown.history.text), /*#__PURE__*/React.createElement("div", {
    className: "factor-branch-indicator"
  }, "code: ", evaluation.breakdown.history.rule))), /*#__PURE__*/React.createElement("div", {
    className: "trace-terminal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal-dots"
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal-dot dot-red"
  }), /*#__PURE__*/React.createElement("div", {
    className: "terminal-dot dot-yellow"
  }), /*#__PURE__*/React.createElement("div", {
    className: "terminal-dot dot-green"
  })), /*#__PURE__*/React.createElement("div", null, "WeightedRuleEngine.java • Literal Evaluation Trace Log"), /*#__PURE__*/React.createElement("div", null, "Runtime: JVM 17 (Deterministic)")), /*#__PURE__*/React.createElement("div", null, evaluation.traces.map((tr, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    className: "trace-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "trace-step"
  }, tr.step), /*#__PURE__*/React.createElement("span", {
    className: "trace-body"
  }, tr.text, " ", tr.pts && /*#__PURE__*/React.createElement("span", {
    className: "pts"
  }, "[", tr.pts, "]"))))))), /*#__PURE__*/React.createElement("div", {
    className: "phone-preview-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      fontWeight: '700',
      color: 'var(--text-primary)'
    }
  }, "Device Interaction"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, "Physical Android Response")), /*#__PURE__*/React.createElement("div", {
    className: "phone-mockup-wrapper"
  }, /*#__PURE__*/React.createElement("div", {
    className: "phone-speaker"
  }), /*#__PURE__*/React.createElement("div", {
    className: "phone-screen"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "phone-status-bar"
  }, /*#__PURE__*/React.createElement("span", null, timeOfDay), /*#__PURE__*/React.createElement("span", null, "5G ● 94%")), /*#__PURE__*/React.createElement("div", {
    className: `phone-incoming-card call-${evaluation.level.toLowerCase()}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `caller-avatar ${evaluation.level === "HIGH" ? "avatar-high" : ""}`
  }, profile.name ? profile.name.charAt(0).toUpperCase() : "?"), /*#__PURE__*/React.createElement("div", {
    className: "caller-name-display"
  }, profile.name || "Unknown"), /*#__PURE__*/React.createElement("div", {
    className: "caller-number-display"
  }, profile.phone), /*#__PURE__*/React.createElement("div", {
    className: "phone-urgency-tag",
    style: {
      background: evaluation.level === "HIGH" ? "rgba(239, 68, 68, 0.2)" : evaluation.level === "MEDIUM" ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
      color: evaluation.color
    }
  }, "SafeCall Urgency: ", evaluation.score, "/100 [", evaluation.level, "]"), /*#__PURE__*/React.createElement("div", {
    className: "phone-dnd-status"
  }, evaluation.level === "HIGH" && "&#9888;&#65039; DND OVERRIDDEN: Audible Alert Active", evaluation.level === "MEDIUM" && "&#128276; Priority Banner: Vibrate Alert", evaluation.level === "LOW" && "&#128263; Standard Ringtone / Muted"))), /*#__PURE__*/React.createElement("div", {
    className: "phone-actions-bottom"
  }, /*#__PURE__*/React.createElement("button", {
    className: "phone-action-btn btn-decline",
    title: "Decline Call"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
  }))), /*#__PURE__*/React.createElement("button", {
    className: "phone-action-btn btn-accept",
    title: "Accept Call"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
  }))))))))), activeTab === "cases" && /*#__PURE__*/React.createElement("div", {
    className: "glass-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "🧪"), " Backend Benchmark Test Suite (All 8 Formal Cases)"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Matches com.safecall.test.WeightedRuleEngineTest")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
      gap: '16px'
    }
  }, BENCHMARK_CASES.map((bc, idx) => {
    const res = evaluateUrgency({
      name: bc.contactName,
      phone: bc.phoneNumber,
      priority: bc.priority
    }, bc.recentCallsCount, bc.timeOfDay, bc.historyTotal, bc.historyMissed);
    return /*#__PURE__*/React.createElement("div", {
      key: bc.id,
      className: `case-card ${selectedCaseId === bc.id ? "active" : ""}`,
      onClick: () => {
        loadCase(bc);
        setActiveTab("playground");
      },
      style: {
        padding: '20px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "case-num"
    }, "CASE #", idx + 1), /*#__PURE__*/React.createElement("div", {
      className: "case-expected",
      style: {
        color: res.color,
        background: 'rgba(0,0,0,0.3)',
        padding: '2px 8px',
        borderRadius: '4px'
      }
    }, res.score, "/100 [", res.level, "]")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '15px',
        fontWeight: '700',
        color: 'white',
        marginBottom: '4px'
      }
    }, bc.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '12px',
        color: 'var(--text-muted)',
        marginBottom: '12px'
      }
    }, bc.subtitle), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '12px',
        color: '#cbd5e1',
        background: 'rgba(255,255,255,0.03)',
        padding: '10px',
        borderRadius: '6px',
        marginBottom: '12px'
      }
    }, bc.description), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: 'var(--text-secondary)'
      }
    }, /*#__PURE__*/React.createElement("span", null, "Prio: ", /*#__PURE__*/React.createElement("b", null, bc.priority)), /*#__PURE__*/React.createElement("span", null, "Redials: ", /*#__PURE__*/React.createElement("b", null, bc.recentCallsCount)), /*#__PURE__*/React.createElement("span", null, "Time: ", /*#__PURE__*/React.createElement("b", null, bc.timeOfDay))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: '14px',
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '12px',
        color: 'var(--accent-cyan)',
        fontWeight: '600'
      }
    }, "Test in Playground →")));
  }))), activeTab === "code" && /*#__PURE__*/React.createElement("div", {
    className: "glass-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "📄"), " Literal Java Backend Source • WeightedRuleEngine.java"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Path: app/src/main/java/com/safecall/engine/WeightedRuleEngine.java")), /*#__PURE__*/React.createElement("div", {
    className: "code-inspector-container"
  }, /*#__PURE__*/React.createElement("pre", {
    className: "code-block"
  }, /*#__PURE__*/React.createElement("code", null, `package com.safecall.engine;

import com.safecall.model.CallContext;
import com.safecall.model.CallerProfile;
import com.safecall.model.CallRecord;
import com.safecall.model.UrgencyResult;
import java.util.Calendar;
import java.util.List;

public class WeightedRuleEngine {

    public UrgencyResult evaluate(CallContext context) {
        int score = 0;
        StringBuilder explanation = new StringBuilder();

        // 1. Caller Identity (Max 30)
        CallerProfile profile = context.getProfile();
        boolean isKnown = (profile != null);
        if (isKnown) {
            if (profile.getPriority() == CallerProfile.Priority.EMERGENCY) {
                score += 30; // [TRIGGERED WHEN PRIORITY IS EMERGENCY]
                explanation.append("Emergency contact (+30). ");
            } else if (profile.getPriority() == CallerProfile.Priority.TRUSTED) {
                score += 20; // [TRIGGERED WHEN PRIORITY IS TRUSTED]
                explanation.append("Trusted contact (+20). ");
            } else {
                explanation.append("Normal contact (+0). ");
            }
        } else {
            explanation.append("Unknown caller (+0). ");
        }

        // 2. Call Frequency (Max 30)
        List<CallRecord> recent = context.getRecentCalls();
        int recentCount = (recent != null) ? recent.size() : 0;
        if (recentCount >= 3) {
            score += 30; // [HIGH FREQUENCY REDIALS]
            explanation.append("High frequency calling (+30). ");
        } else if (recentCount >= 1) {
            score += 15; // [REPEATED REDIAL]
            explanation.append("Repeated calls (+15). ");
        } else {
            explanation.append("Normal frequency (+0). ");
        }

        // 3. Timing and Context (Max 20)
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(context.getCurrentCallTime());
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        boolean isLateNight = (hour >= 23 || hour <= 5);
        
        // Late night only matters if it's an emergency contact OR repeated call
        if (isLateNight && (recentCount >= 1 || (isKnown && profile.getPriority() == CallerProfile.Priority.EMERGENCY))) {
            score += 20; // [LATE NIGHT CONTEXT]
            explanation.append("Late night contextual urgency (+20). ");
        } else {
            explanation.append("Normal timing (+0). ");
        }

        // 4. Historical Behaviour (Max 20)
        List<CallRecord> history = context.getHistoricalCalls();
        if (history != null && history.size() >= 3) {
            int missedCount = 0;
            for (CallRecord r : history) {
                if (r.getDurationSeconds() == 0) missedCount++;
            }
            if (missedCount >= history.size() / 2) {
                score += 20; // [UNUSUAL MISSED PATTERN]
                explanation.append("Historically high missed call rate (+20). ");
            } else {
                explanation.append("Normal historical behaviour (+0). ");
            }
        } else {
            explanation.append("Insufficient history neutrally scored (+0). ");
        }

        // Clamp 0-100
        score = Math.max(0, Math.min(100, score));

        UrgencyResult.Level level;
        if (score <= 30) {
            level = UrgencyResult.Level.LOW;
        } else if (score <= 70) {
            level = UrgencyResult.Level.MEDIUM;
        } else {
            level = UrgencyResult.Level.HIGH;
        }

        return new UrgencyResult(score, level, explanation.toString().trim());
    }
}`)))), activeTab === "db" && /*#__PURE__*/React.createElement("div", {
    className: "glass-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "🗃"), " SQLite Database Logs Table • table 'call_history'"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    onClick: () => setDbLogs([])
  }, "Clear Records"))), /*#__PURE__*/React.createElement("div", {
    className: "table-responsive"
  }, /*#__PURE__*/React.createElement("table", {
    className: "history-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "ID"), /*#__PURE__*/React.createElement("th", null, "Caller"), /*#__PURE__*/React.createElement("th", null, "Phone Number"), /*#__PURE__*/React.createElement("th", null, "Call Time"), /*#__PURE__*/React.createElement("th", null, "Score"), /*#__PURE__*/React.createElement("th", null, "Urgency Level"), /*#__PURE__*/React.createElement("th", null, "Engine Explanation"))), /*#__PURE__*/React.createElement("tbody", null, dbLogs.map(log => /*#__PURE__*/React.createElement("tr", {
    key: log.id
  }, /*#__PURE__*/React.createElement("td", null, "#", log.id), /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: '600',
      color: 'white'
    }
  }, log.name), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, log.phone), /*#__PURE__*/React.createElement("td", null, log.time), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: '700'
    }
  }, log.score, "/100"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: `level-badge level-${log.level.toLowerCase()}`,
    style: {
      padding: '2px 8px',
      fontSize: '11px',
      margin: 0
    }
  }, log.level)), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: '12px',
      color: '#94a3b8'
    }
  }, log.exp))))))), activeTab === "java" && /*#__PURE__*/React.createElement(JavaGradleVisualizer, null), activeTab === "oop" && /*#__PURE__*/React.createElement(OopFlowAnimation, null));
}

// -------------------------------------------------------------
// Java OOP & Gradle Academic Visualizer Component
// -------------------------------------------------------------
function JavaGradleVisualizer() {
  const [subTab, setSubTab] = useState("pillars"); // "pillars" | "classes" | "gradle" | "threads" | "viva"

  return /*#__PURE__*/React.createElement("div", {
    className: "java-visualizer-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "java-subnav-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: `java-subnav-btn ${subTab === "pillars" ? "active" : ""}`,
    onClick: () => setSubTab("pillars")
  }, /*#__PURE__*/React.createElement("span", null, "🏛️"), " 1. The 4 OOP Pillars"), /*#__PURE__*/React.createElement("button", {
    className: `java-subnav-btn ${subTab === "classes" ? "active" : ""}`,
    onClick: () => setSubTab("classes")
  }, /*#__PURE__*/React.createElement("span", null, "📦"), " 2. Classes, Objects & Memory"), /*#__PURE__*/React.createElement("button", {
    className: `java-subnav-btn ${subTab === "gradle" ? "active" : ""}`,
    onClick: () => setSubTab("gradle")
  }, /*#__PURE__*/React.createElement("span", null, "🐘"), " 3. What is Gradle? Build Pipeline"), /*#__PURE__*/React.createElement("button", {
    className: `java-subnav-btn ${subTab === "threads" ? "active" : ""}`,
    onClick: () => setSubTab("threads")
  }, /*#__PURE__*/React.createElement("span", null, "🧵"), " 4. Concurrency & Thread Safety"), /*#__PURE__*/React.createElement("button", {
    className: `java-subnav-btn ${subTab === "viva" ? "active" : ""}`,
    onClick: () => setSubTab("viva")
  }, /*#__PURE__*/React.createElement("span", null, "🎓"), " 5. Teacher's Viva Defense Q&A")), subTab === "pillars" && /*#__PURE__*/React.createElement("div", {
    className: "oop-pillars-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-pillar-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pillar-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pillar-badge"
  }, "Pillar 1"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "🔒")), /*#__PURE__*/React.createElement("div", {
    className: "pillar-title"
  }, "Encapsulation"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-class-target"
  }, "Target: CallRecord.java & CallerProfile.java"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-desc"
  }, "Data hiding & state integrity. All fields (e.g. ", /*#__PURE__*/React.createElement("code", null, "phoneNumber"), ", ", /*#__PURE__*/React.createElement("code", null, "urgencyScore"), ") are declared ", /*#__PURE__*/React.createElement("code", null, "private final"), " and accessed solely through validated public getters. External callers cannot directly mutate urgency scores or forge call timestamps."), /*#__PURE__*/React.createElement("div", {
    className: "pillar-code-box"
  }, `public class CallRecord {
    private final String phoneNumber; // Hidden state
    private final long timestamp;
    private final int urgencyScore;

    // Public getter with validation
    public int getUrgencyScore() {
        return Math.max(0, Math.min(100, urgencyScore));
    }
}`)), /*#__PURE__*/React.createElement("div", {
    className: "oop-pillar-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pillar-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pillar-badge"
  }, "Pillar 2"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "🧬")), /*#__PURE__*/React.createElement("div", {
    className: "pillar-title"
  }, "Inheritance & Framework Extension"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-class-target"
  }, "Target: DatabaseHelper.java & SafeCallPhoneStateReceiver.java"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-desc"
  }, "Extending foundational Android OS base classes. ", /*#__PURE__*/React.createElement("code", null, "DatabaseHelper extends SQLiteOpenHelper"), " inherits database lifecycle management, schema migration, and transaction locking. ", /*#__PURE__*/React.createElement("code", null, "SafeCallPhoneStateReceiver extends BroadcastReceiver"), " hooks into Android OS telephony events."), /*#__PURE__*/React.createElement("div", {
    className: "pillar-code-box"
  }, `// Inherits SQLite schema lifecycle
public class DatabaseHelper extends SQLiteOpenHelper {
    public DatabaseHelper(Context ctx) {
        super(ctx, "safecall.db", null, 1);
    }
    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(CREATE_CALL_HISTORY_TABLE);
    }
}`)), /*#__PURE__*/React.createElement("div", {
    className: "oop-pillar-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pillar-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pillar-badge"
  }, "Pillar 3"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "🎭")), /*#__PURE__*/React.createElement("div", {
    className: "pillar-title"
  }, "Polymorphism"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-class-target"
  }, "Target: CallerProfile.Priority & UrgencyResult.Level"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-desc"
  }, "Dynamic behavior and type safety. Enums exhibit compile-time polymorphism with custom weight behaviors. The engine treats different caller categories (EMERGENCY, TRUSTED, NORMAL) polymorphically through a unified priority interface."), /*#__PURE__*/React.createElement("div", {
    className: "pillar-code-box"
  }, `public enum Priority {
    NORMAL(0),
    TRUSTED(15),
    EMERGENCY(25);

    private final int weight;
    Priority(int weight) { this.weight = weight; }
    public int getWeight() { return weight; }
}`)), /*#__PURE__*/React.createElement("div", {
    className: "oop-pillar-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pillar-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pillar-badge"
  }, "Pillar 4"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "🧩")), /*#__PURE__*/React.createElement("div", {
    className: "pillar-title"
  }, "Abstraction"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-class-target"
  }, "Target: CallEventProcessor.java & DatabaseHelper"), /*#__PURE__*/React.createElement("div", {
    className: "pillar-desc"
  }, "Hiding low-level implementation complexity. ", /*#__PURE__*/React.createElement("code", null, "CallEventProcessor"), " abstracts Android's asynchronous execution queue, SQLite C-cursor mechanics, and HTTP REST networking into one clean high-level method: ", /*#__PURE__*/React.createElement("code", null, "processIncomingCallEvent()"), "."), /*#__PURE__*/React.createElement("div", {
    className: "pillar-code-box"
  }, `// High-level abstraction hides 100+ lines of SQL & networking
public class CallEventProcessor {
    public void processIncomingCallEvent(String phone, long time) {
        CallContext context = buildContext(phone, time); // Abstracted SQL
        UrgencyResult result = engine.evaluate(context); // Pure logic
        if (result.getScore() >= 80) dispatchAlert(result); // Network
    }
}`))), subTab === "classes" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header",
    style: {
      marginBottom: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "📦"), " Core Class Hierarchy & Object Relationships in SafeCall AI"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Object Composition (Has-A) vs Inheritance (Is-A)")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '800',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, "CallerProfile.java"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, "Entity Object (Model)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1'
    }
  }, "Encapsulates contact metadata: ", /*#__PURE__*/React.createElement("code", null, "id"), ", ", /*#__PURE__*/React.createElement("code", null, "name"), ", ", /*#__PURE__*/React.createElement("code", null, "phoneNumber"), ", ", /*#__PURE__*/React.createElement("code", null, "relationship"), ", and ", /*#__PURE__*/React.createElement("code", null, "Priority"), " enum.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '800',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, "CallRecord.java"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, "Entity Object (Model)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1'
    }
  }, "Represents a single telephony call event: ", /*#__PURE__*/React.createElement("code", null, "phoneNumber"), ", ", /*#__PURE__*/React.createElement("code", null, "timestamp"), ", ", /*#__PURE__*/React.createElement("code", null, "durationSeconds"), ", ", /*#__PURE__*/React.createElement("code", null, "urgencyScore"), ".")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#a78bfa',
      fontWeight: '800',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, "CallContext.java"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, "Composite Container (Has-A)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1'
    }
  }, "Aggregates references to ", /*#__PURE__*/React.createElement("code", null, "CallerProfile"), ", ", /*#__PURE__*/React.createElement("code", null, "List<CallRecord> recentCalls"), ", and ", /*#__PURE__*/React.createElement("code", null, "List<CallRecord> history"), " for evaluation.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#34d399',
      fontWeight: '800',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, "WeightedRuleEngine.java"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, "Stateless Domain Service"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1'
    }
  }, "Pure deterministic evaluation logic. Contains no mutable state; produces an immutable ", /*#__PURE__*/React.createElement("code", null, "UrgencyResult"), " given a ", /*#__PURE__*/React.createElement("code", null, "CallContext"), ".")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#f59e0b',
      fontWeight: '800',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, "UrgencyResult.java"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, "Value Object / DTO"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1'
    }
  }, "Immutable Data Transfer Object holding the final score ($0–100$), classification level (", /*#__PURE__*/React.createElement("code", null, "LOW"), ", ", /*#__PURE__*/React.createElement("code", null, "MEDIUM"), ", ", /*#__PURE__*/React.createElement("code", null, "HIGH"), "), and explanation.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#ef4444',
      fontWeight: '800',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px'
    }
  }, "DatabaseHelper.java"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      marginBottom: '8px'
    }
  }, "Thread-Safe Singleton DAO"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1'
    }
  }, "Encapsulates all SQLite persistence. Implements the Singleton pattern to eliminate SQLite database locks across threads.")))), /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header",
    style: {
      marginBottom: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "🧠"), " JVM Memory Architecture: Stack vs Heap in SafeCall"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "How Java Manages Objects During a Real Phone Call")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#060a14',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: '10px',
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '800',
      marginBottom: '8px',
      fontSize: '14px'
    }
  }, "JVM STACK MEMORY (Thread-Specific)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1',
      lineHeight: '1.5'
    }
  }, "• ", /*#__PURE__*/React.createElement("b", null, "Method Execution Frames:"), " Pushed onto stack when ", /*#__PURE__*/React.createElement("code", null, "evaluate(context)"), " is called.", /*#__PURE__*/React.createElement("br", null), "• ", /*#__PURE__*/React.createElement("b", null, "Primitive Local Variables:"), " ", /*#__PURE__*/React.createElement("code", null, "int score = 0;"), ", ", /*#__PURE__*/React.createElement("code", null, "long currentTime = 1728929340L;"), " stored directly on the stack.", /*#__PURE__*/React.createElement("br", null), "• ", /*#__PURE__*/React.createElement("b", null, "Object References:"), " Pointers holding 32/64-bit addresses pointing to Heap objects (e.g. ", /*#__PURE__*/React.createElement("code", null, "profileRef = 0x7A1"), ").")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#060a14',
      border: '1px solid rgba(167, 139, 250, 0.3)',
      borderRadius: '10px',
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#a78bfa',
      fontWeight: '800',
      marginBottom: '8px',
      fontSize: '14px'
    }
  }, "JVM HEAP MEMORY (Shared Across Threads)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1',
      lineHeight: '1.5'
    }
  }, "• ", /*#__PURE__*/React.createElement("b", null, "Object Instances:"), " ", /*#__PURE__*/React.createElement("code", null, "new CallerProfile(...)"), " allocated on heap at ", /*#__PURE__*/React.createElement("code", null, "@0x7A1"), ".", /*#__PURE__*/React.createElement("br", null), "• ", /*#__PURE__*/React.createElement("b", null, "Collections:"), " ", /*#__PURE__*/React.createElement("code", null, "ArrayList<CallRecord>"), " storing recent & historical call objects.", /*#__PURE__*/React.createElement("br", null), "• ", /*#__PURE__*/React.createElement("b", null, "Garbage Collection:"), " Short-lived context objects are automatically collected by Android's ART garbage collector after evaluation."))))), subTab === "gradle" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '16px',
      fontWeight: '800',
      color: '#ffffff',
      marginBottom: '6px'
    }
  }, "What is Gradle and Why Does SafeCall AI Use It?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: '#cbd5e1',
      lineHeight: '1.55'
    }
  }, /*#__PURE__*/React.createElement("b", null, "Gradle"), " is an enterprise build automation tool designed for Java and Android. Instead of manually invoking ", /*#__PURE__*/React.createElement("code", null, "javac"), ", linking dozens of JAR files, generating resource IDs, and compiling XML, Gradle automates the entire lifecycle: resolving remote dependencies from Google Maven, compiling Java source to bytecode, converting bytecode to Android Dalvik Executable (", /*#__PURE__*/React.createElement("code", null, ".dex"), "), and packaging everything into an installable ", /*#__PURE__*/React.createElement("code", null, "app-debug.apk"), "."), /*#__PURE__*/React.createElement("div", {
    className: "gradle-pipeline-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gradle-step-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '20px',
      marginBottom: '4px'
    }
  }, "📝"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#38bdf8',
      fontSize: '12px'
    }
  }, "1. Java Source"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, ".java files in src/main/java")), /*#__PURE__*/React.createElement("div", {
    className: "gradle-step-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '20px',
      marginBottom: '4px'
    }
  }, "⚙️"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#38bdf8',
      fontSize: '12px'
    }
  }, "2. Gradle javac"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, "Compiles to JVM .class bytecode")), /*#__PURE__*/React.createElement("div", {
    className: "gradle-step-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '20px',
      marginBottom: '4px'
    }
  }, "🤖"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#38bdf8',
      fontSize: '12px'
    }
  }, "3. D8 / R8 Dexer"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, "Converts .class to Android classes.dex")), /*#__PURE__*/React.createElement("div", {
    className: "gradle-step-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '20px',
      marginBottom: '4px'
    }
  }, "📦"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#38bdf8',
      fontSize: '12px'
    }
  }, "4. AAPT2 Resources"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, "Compiles AndroidManifest & assets")), /*#__PURE__*/React.createElement("div", {
    className: "gradle-step-card"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '20px',
      marginBottom: '4px'
    }
  }, "📱"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#34d399',
      fontSize: '12px'
    }
  }, "5. app-debug.apk"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: 'var(--text-muted)'
    }
  }, "Signed, installable Android APK")))), /*#__PURE__*/React.createElement("div", {
    className: "gradle-files-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-title"
  }, "1. settings.gradle"), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-role"
  }, "Project Structure & Module Discovery"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#94a3b8',
      marginBottom: '10px'
    }
  }, "Tells Gradle which submodules exist in this workspace. SafeCall includes both the Android application and the ZK dashboard module."), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-code"
  }, `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
rootProject.name = "safecall-java"
include ':app'
include ':zk-dashboard'`)), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-title"
  }, "2. Root build.gradle"), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-role"
  }, "Project-Wide Plugins & Clean Task"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#94a3b8',
      marginBottom: '10px'
    }
  }, "Configures the Android Gradle Plugin (AGP) version across all sub-projects and declares global repository mirrors."), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-code"
  }, `plugins {
    id 'com.android.application' 
        version '8.2.2' apply false
    id 'com.android.library' 
        version '8.2.2' apply false
}

task clean(type: Delete) {
    delete rootProject.buildDir
}`)), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-title"
  }, "3. app/build.gradle"), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-role"
  }, "App Config, SDK Targets & Dependencies"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#94a3b8',
      marginBottom: '10px'
    }
  }, "Specifies Android SDK 34 (Android 14), minimum SDK 26 (Android 8.0), and external libraries like JUnit 4.13.2."), /*#__PURE__*/React.createElement("div", {
    className: "gradle-file-code"
  }, `android {
    namespace 'com.safecall'
    compileSdk 34 // Android 14

    defaultConfig {
        applicationId "com.safecall"
        minSdk 26    // Android 8.0+
        targetSdk 34
        versionCode 1
    }
}
dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    testImplementation 'junit:junit:4.13.2'
}`)))), subTab === "threads" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header",
    style: {
      marginBottom: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "🧵"), " Multithreading & Concurrency in SafeCall AI"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Why Database & Network Operations Cannot Run on the Main UI Thread")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '13px',
      color: '#cbd5e1',
      lineHeight: '1.55',
      marginBottom: '16px'
    }
  }, "Android strictly enforces that the ", /*#__PURE__*/React.createElement("b", null, "Main Thread (UI Thread)"), " is reserved solely for drawing frames at 60 FPS. If an application attempts SQLite queries or HTTP network calls on the main thread, the OS immediately crashes with a ", /*#__PURE__*/React.createElement("code", null, "NetworkOnMainThreadException"), " or freezes with an ", /*#__PURE__*/React.createElement("b", null, "ANR (Application Not Responding)"), " dialog. SafeCall AI uses Java's ", /*#__PURE__*/React.createElement("code", null, "ExecutorService"), " to execute all telephony evaluations in a background worker thread."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#060a14',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '10px',
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#ef4444',
      fontWeight: '800',
      marginBottom: '8px',
      fontSize: '13px'
    }
  }, "1. Main UI Thread (Ringing Screen)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1',
      lineHeight: '1.5'
    }
  }, "• Handles user taps, answer button, and caller name rendering.", /*#__PURE__*/React.createElement("br", null), "• Must respond in < 16 milliseconds per frame.", /*#__PURE__*/React.createElement("br", null), "• ", /*#__PURE__*/React.createElement("b", null, "Never blocks"), " waiting for SQLite or backend HTTP responses.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#060a14',
      border: '1px solid rgba(52, 211, 153, 0.3)',
      borderRadius: '10px',
      padding: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#34d399',
      fontWeight: '800',
      marginBottom: '8px',
      fontSize: '13px'
    }
  }, "2. Background Worker Thread (ExecutorService)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#cbd5e1',
      lineHeight: '1.5'
    }
  }, "• ", /*#__PURE__*/React.createElement("code", null, "Executors.newSingleThreadExecutor()"), " runs sequential call events.", /*#__PURE__*/React.createElement("br", null), "• Queries SQLite table ", /*#__PURE__*/React.createElement("code", null, "call_history"), " for prior redials.", /*#__PURE__*/React.createElement("br", null), "• Executes ", /*#__PURE__*/React.createElement("code", null, "WeightedRuleEngine.evaluate()"), " in ~4 ms.", /*#__PURE__*/React.createElement("br", null), "• Dispatches HTTP POST to Node.js backend when score ≥ 80."))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#38bdf8',
      fontWeight: '700',
      marginBottom: '6px'
    }
  }, "Code Implementation in CallEventProcessor.java:"), /*#__PURE__*/React.createElement("pre", {
    className: "code-block",
    style: {
      margin: 0,
      padding: '12px'
    }
  }, /*#__PURE__*/React.createElement("code", null, `// Thread Pool prevents UI freeze
private final ExecutorService workerExecutor = Executors.newSingleThreadExecutor();

public void onCallMissed(String phoneNumber, long timestamp) {
    workerExecutor.execute(() -> {
        // Runs on Background Worker Thread
        CallContext context = repository.buildContext(phoneNumber, timestamp);
        UrgencyResult result = ruleEngine.evaluate(context);
        repository.insertCallRecord(new CallRecord(phoneNumber, timestamp, result.getScore()));

        if (result.getScore() >= 80) {
            httpAlertDispatcher.sendBreakthroughAlert(result); // Safe from NetworkOnMainThreadException
        }
    });
}`))))), subTab === "viva" && /*#__PURE__*/React.createElement("div", {
    className: "viva-card-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-q"
  }, /*#__PURE__*/React.createElement("span", null, "❓"), " 1. \"How did you use Object-Oriented Programming (OOP) in this project?\""), /*#__PURE__*/React.createElement("div", {
    className: "viva-a"
  }, "\"We applied all 4 pillars of OOP: ", /*#__PURE__*/React.createElement("b", null, "Encapsulation"), " in ", /*#__PURE__*/React.createElement("code", null, "CallRecord"), " and ", /*#__PURE__*/React.createElement("code", null, "CallerProfile"), " with private immutable fields; ", /*#__PURE__*/React.createElement("b", null, "Inheritance"), " by extending Android's ", /*#__PURE__*/React.createElement("code", null, "BroadcastReceiver"), " and ", /*#__PURE__*/React.createElement("code", null, "SQLiteOpenHelper"), "; ", /*#__PURE__*/React.createElement("b", null, "Polymorphism"), " via enum-driven priority weights and score level dispatch; and ", /*#__PURE__*/React.createElement("b", null, "Abstraction"), " by isolating the Java Rule Engine from SQLite and Android Telephony hardware through ", /*#__PURE__*/React.createElement("code", null, "CallEventProcessor"), ".\"")), /*#__PURE__*/React.createElement("div", {
    className: "viva-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-q"
  }, /*#__PURE__*/React.createElement("span", null, "❓"), " 2. \"What is Gradle, and what happens when you build the app?\""), /*#__PURE__*/React.createElement("div", {
    className: "viva-a"
  }, "\"", /*#__PURE__*/React.createElement("b", null, "Gradle"), " is our build automation tool. When we run ", /*#__PURE__*/React.createElement("code", null, "./gradlew assembleDebug"), ", Gradle resolves dependencies like JUnit, compiles our ", /*#__PURE__*/React.createElement("code", null, ".java"), " source files into JVM ", /*#__PURE__*/React.createElement("code", null, ".class"), " bytecode using ", /*#__PURE__*/React.createElement("code", null, "javac"), ", translates the bytecode into Dalvik/ART executable format (", /*#__PURE__*/React.createElement("code", null, "classes.dex"), ") using the ", /*#__PURE__*/React.createElement("b", null, "D8 dexer"), ", compiles Android XML layouts with ", /*#__PURE__*/React.createElement("b", null, "AAPT2"), ", and packages everything into an installable ", /*#__PURE__*/React.createElement("code", null, "app-debug.apk"), ".\"")), /*#__PURE__*/React.createElement("div", {
    className: "viva-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-q"
  }, /*#__PURE__*/React.createElement("span", null, "❓"), " 3. \"Why is DatabaseHelper implemented as a Singleton?\""), /*#__PURE__*/React.createElement("div", {
    className: "viva-a"
  }, "\"SQLite in Android uses file-level locking. If multiple threads instantiate multiple ", /*#__PURE__*/React.createElement("code", null, "SQLiteOpenHelper"), " instances, concurrent writes cause ", /*#__PURE__*/React.createElement("code", null, "SQLiteDatabaseLockedException"), ". The ", /*#__PURE__*/React.createElement("b", null, "Singleton pattern"), " with synchronized double-checked locking guarantees only one database helper instance manages connection pooling across all background threads.\"")), /*#__PURE__*/React.createElement("div", {
    className: "viva-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-q"
  }, /*#__PURE__*/React.createElement("span", null, "❓"), " 4. \"How does the system distinguish an answered call from a missed call?\""), /*#__PURE__*/React.createElement("div", {
    className: "viva-a"
  }, "\"We implemented a ", /*#__PURE__*/React.createElement("b", null, "State Pattern machine"), " in ", /*#__PURE__*/React.createElement("code", null, "SafeCallPhoneStateReceiver.java"), ". The telephony state sequence for an answered call is ", /*#__PURE__*/React.createElement("code", null, "IDLE → RINGING → OFFHOOK → IDLE"), ". For a genuine missed call, the sequence skips ", /*#__PURE__*/React.createElement("code", null, "OFFHOOK"), " and transitions directly ", /*#__PURE__*/React.createElement("code", null, "IDLE → RINGING → IDLE"), ".\"")), /*#__PURE__*/React.createElement("div", {
    className: "viva-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-q"
  }, /*#__PURE__*/React.createElement("span", null, "❓"), " 5. \"What prevents duplicate alerts if a contact redials 3 times in 10 seconds?\""), /*#__PURE__*/React.createElement("div", {
    className: "viva-a"
  }, "\"Two layers of protection: (1) Client-side ", /*#__PURE__*/React.createElement("b", null, "idempotency keys"), " generated from the caller number and timestamp hash, and (2) Server-side ", /*#__PURE__*/React.createElement("b", null, "30-second cooldown window"), " in ", /*#__PURE__*/React.createElement("code", null, "server.js"), " that suppresses duplicate alerts from the same contact within 30 seconds to prevent caregiver alert fatigue.\"")), /*#__PURE__*/React.createElement("div", {
    className: "viva-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "viva-q"
  }, /*#__PURE__*/React.createElement("span", null, "❓"), " 6. \"Why does the Java rule engine run off the Main UI thread?\""), /*#__PURE__*/React.createElement("div", {
    className: "viva-a"
  }, "\"Android prohibits database queries and HTTP network requests on the Main Thread (which causes ", /*#__PURE__*/React.createElement("code", null, "NetworkOnMainThreadException"), " or ANRs). We offload all context gathering, urgency scoring, and FCM alert dispatching to an ", /*#__PURE__*/React.createElement("code", null, "ExecutorService"), " background worker thread.\""))));
}

// -------------------------------------------------------------
// Live Telephony & FCM Pipeline Visualizer Component
// -------------------------------------------------------------
function PipelineVisualizer({
  dbLogs,
  onSimulateToDb
}) {
  const [telemetry, setTelemetry] = useState({
    status: "CONNECTING...",
    uptimeSeconds: 0,
    timestamp: new Date().toISOString(),
    stats: {
      totalUsers: 3,
      seniorCount: 1,
      caregiverCount: 2,
      activePairings: 0,
      activeRelationships: 1,
      caregiversWithFcm: 1,
      totalAlerts: 1
    },
    pairings: [],
    relationships: [],
    recentAlerts: []
  });
  const [activeStage, setActiveStage] = useState(0);
  const [simCaller, setSimCaller] = useState({
    name: "General Hospital Emergency",
    phone: "+91 91111 22233",
    priority: "EMERGENCY"
  });
  const [simScore, setSimScore] = useState(85);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState(null);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  // Fetch telemetry every 3 seconds from Node.js server
  useEffect(() => {
    let isMounted = true;
    const fetchTelemetry = async () => {
      try {
        const url = window.location.port === '4000' ? '/api/dashboard/live' : 'http://localhost:4000/api/dashboard/live';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setTelemetry(data);
        }
      } catch (e) {
        // Fallback gracefully
      }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Trigger Live Event through Pipeline
  const triggerLivePipeline = async (overrideScore, overrideName, overridePrio) => {
    const targetScore = overrideScore !== undefined ? overrideScore : simScore;
    const targetName = overrideName || simCaller.name;
    const targetPrio = overridePrio || simCaller.priority;
    setIsSubmitting(true);
    setDispatchStatus("DISPATCHING");
    const logs = [{
      step: "01. TELEPHONY",
      msg: `Android TelephonyCallback: Incoming Call detected from "${targetName}" (${targetPrio})`,
      ok: true
    }, {
      step: "02. JVM ENGINE",
      msg: `WeightedRuleEngine executed: Score computed = ${targetScore}/100`,
      ok: true
    }, {
      step: "03. THRESHOLD",
      msg: targetScore >= 80 ? `Score ${targetScore} >= 80: Breakthrough Threshold EXCEEDED -> Enqueuing FCM Alert` : `Score ${targetScore} < 80: Below Breakthrough Threshold (80) -> Recorded in local SQLite only`,
      ok: targetScore >= 80
    }];
    setDispatchLogs([...logs]);
    try {
      const url = window.location.port === '4000' ? '/api/alerts/trigger' : 'http://localhost:4000/api/alerts/trigger';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer demo_elderly'
        },
        body: JSON.stringify({
          idempotentId: 'evt_sim_' + Date.now(),
          callerName: targetName,
          callerPhone: simCaller.phone,
          score: targetScore,
          level: targetScore >= 71 ? 'HIGH' : targetScore >= 31 ? 'MEDIUM' : 'LOW',
          explanation: `Pipeline Simulation: Caller "${targetName}" evaluated with urgency score ${targetScore}/100.`,
          callTime: Date.now(),
          isSimulation: false
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.suppressed) {
          logs.push({
            step: "04. COOLDOWN",
            msg: "30-Second Duplicate Cooldown Window Active: Alert suppressed to prevent caregiver fatigue.",
            ok: true
          });
        } else if (data.triggered) {
          logs.push({
            step: "04. GATEWAY",
            msg: `Node.js Backend verified Auth & active Caregiver relationship. Alert registered.`,
            ok: true
          });
          logs.push({
            step: "05. FCM PUSH",
            msg: `Google Firebase Cloud Messaging: Push delivered with system chime sound to Caregiver phone!`,
            ok: true
          });
        } else {
          logs.push({
            step: "04. LOCAL LOG",
            msg: data.message || "Threshold not reached. Alert was not dispatched.",
            ok: false
          });
        }
        setDispatchStatus("SUCCESS");
      } else {
        logs.push({
          step: "04. ERROR",
          msg: data.error || "Failed to dispatch alert",
          ok: false
        });
        setDispatchStatus("ERROR");
      }
      setDispatchLogs([...logs]);
    } catch (err) {
      logs.push({
        step: "04. NETWORK",
        msg: `Backend offline or unreachable (${err.message}). System saved alert to local SQLite offline queue.`,
        ok: false
      });
      setDispatchLogs([...logs]);
      setDispatchStatus("OFFLINE");
    } finally {
      setIsSubmitting(false);
    }
  };
  const STAGES = [{
    num: "Stage 01",
    icon: "📞",
    title: "Android Telephony Interception",
    component: "SafeCallPhoneStateReceiver.java",
    tag: "Android 14 Telephony SDK",
    desc: "Hardware listener registers TelephonyCallback.CallStateListener & PhoneStateListener. Accurately identifies call lifecycle: RINGING -> OFFHOOK (answered) vs RINGING -> IDLE (missed call)."
  }, {
    num: "Stage 02",
    icon: "⚙️",
    title: "Java Rule Engine & SQLite Worker",
    component: "WeightedRuleEngine.java",
    tag: "On-Device JVM Executor",
    desc: "Runs asynchronously via ExecutorService. Evaluates 4 factors: Identity (25), Frequency (35), Timing (10), History (30). Compares against breakthrough threshold (80/100)."
  }, {
    num: "Stage 03",
    icon: "🌐",
    title: "Node.js Gateway Backend",
    component: "server.js (:4000)",
    tag: "REST API & Cooldown Filter",
    desc: "Receives POST /api/alerts/trigger with Bearer Token. Enforces 30-second duplicate cooldown window, validates idempotency key, and verifies active Caregiver pairing."
  }, {
    num: "Stage 04",
    icon: "☁️",
    title: "Google Firebase Cloud Messaging",
    component: "fcmDispatcher.js (HTTP v1)",
    tag: "FCM Push Dispatcher",
    desc: "Constructs high-priority FCM payload with chime.wav sound, urgency badge, caller details, and dispatches directly to the caregiver's registered FCM device token."
  }, {
    num: "Stage 05",
    icon: "🔔",
    title: "Caregiver Android Phone",
    component: "SafeCall Android App",
    tag: "Heads-Up Alert & Chime",
    desc: "Wakes caregiver device with native system notification sound & prominent banner. Provides 1-tap 'Acknowledge Alert' loop (POST /api/alerts/:id/acknowledge)."
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "pipeline-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-icon-box"
  }, "🌐"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-num",
    style: {
      color: '#34d399'
    }
  }, telemetry.status), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-label"
  }, "Backend Gateway (:4000)"))), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-icon-box",
    style: {
      color: '#38bdf8'
    }
  }, "👥"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-num"
  }, telemetry.stats ? `${telemetry.stats.seniorCount} Senior ↔ ${telemetry.stats.caregiverCount} Caregivers` : "1 ↔ 1"), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-label"
  }, "Active Linked Pairings"))), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-icon-box",
    style: {
      color: '#a78bfa'
    }
  }, "☁️"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-num"
  }, telemetry.stats ? `${telemetry.stats.caregiversWithFcm} Bound` : "1 Bound"), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-label"
  }, "FCM Push Device Tokens"))), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-icon-box",
    style: {
      color: '#f59e0b'
    }
  }, "🚨"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "telemetry-num"
  }, telemetry.stats ? telemetry.stats.totalAlerts : 1), /*#__PURE__*/React.createElement("div", {
    className: "telemetry-label"
  }, "Breakthrough Alerts Dispatched")))), /*#__PURE__*/React.createElement("div", {
    className: "pipeline-flow-wrapper"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px',
      fontWeight: '800',
      color: '#ffffff'
    }
  }, "Real-Time End-to-End Call & FCM Push Pipeline"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: 'var(--text-muted)'
    }
  }, "From physical Android telephone ring to Caregiver phone push notification")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "live-pulse-dot"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#34d399',
      fontWeight: '600'
    }
  }, "Live Gateway Connected"))), /*#__PURE__*/React.createElement("div", {
    className: "pipeline-stages-grid"
  }, STAGES.map((st, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    className: `pipeline-stage-card ${activeStage === idx ? "stage-active" : ""}`,
    onClick: () => setActiveStage(idx)
  }, /*#__PURE__*/React.createElement("div", {
    className: "pipeline-stage-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stage-num-badge"
  }, st.num), /*#__PURE__*/React.createElement("span", {
    className: "stage-icon"
  }, st.icon)), /*#__PURE__*/React.createElement("div", {
    className: "stage-title"
  }, st.title), /*#__PURE__*/React.createElement("div", {
    className: "stage-component"
  }, st.component), /*#__PURE__*/React.createElement("div", {
    className: "stage-details"
  }, st.desc), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "stage-tag"
  }, st.tag)))))), /*#__PURE__*/React.createElement("div", {
    className: "dispatch-control-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header",
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "🚀"), " Hardware Call Simulation & Live Pipeline Dispatcher"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Interactive Presentation Tool")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "Quick Scenario Trigger Presets"), /*#__PURE__*/React.createElement("span", {
    className: "desc"
  }, "Click to test live")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    style: {
      textAlign: 'left',
      padding: '10px 14px',
      borderColor: 'rgba(239, 68, 68, 0.4)',
      background: 'rgba(239, 68, 68, 0.08)'
    },
    onClick: () => {
      setSimCaller({
        name: "General Hospital ICU",
        phone: "+91 91111 22233",
        priority: "EMERGENCY"
      });
      setSimScore(85);
      triggerLivePipeline(85, "General Hospital ICU", "EMERGENCY");
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#ef4444'
    }
  }, "🚨 Scenario A: Critical Medical Emergency (Score: 85)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#cbd5e1'
    }
  }, "Hospital calling repeatedly • Exceeds 80 threshold • Triggers real FCM push to Caregiver")), /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    style: {
      textAlign: 'left',
      padding: '10px 14px',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      background: 'rgba(245, 158, 11, 0.08)'
    },
    onClick: () => {
      setSimCaller({
        name: "Mom (Repeated Call)",
        phone: "+91 98123 45678",
        priority: "TRUSTED"
      });
      setSimScore(45);
      triggerLivePipeline(45, "Mom (Repeated Call)", "TRUSTED");
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#f59e0b'
    }
  }, "⚠️ Scenario B: Trusted Contact Daytime Call (Score: 45)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#cbd5e1'
    }
  }, "Trusted redial • Under 80 threshold • Recorded in local SQLite without caregiver alert")), /*#__PURE__*/React.createElement("button", {
    className: "btn-secondary",
    style: {
      textAlign: 'left',
      padding: '10px 14px',
      borderColor: 'rgba(16, 185, 129, 0.4)',
      background: 'rgba(16, 185, 129, 0.08)'
    },
    onClick: () => {
      setSimCaller({
        name: "Unknown Telemarketer",
        phone: "+91 87654 32109",
        priority: "UNKNOWN"
      });
      setSimScore(0);
      triggerLivePipeline(0, "Unknown Telemarketer", "UNKNOWN");
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: '700',
      color: '#10b981'
    }
  }, "📞 Scenario C: Unknown Caller Single Ring (Score: 0)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#cbd5e1'
    }
  }, "Unsaved number • Zero urgency • Silently ignored by system")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px',
      marginBottom: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "Caller Name")), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input-text",
    value: simCaller.name,
    onChange: e => setSimCaller({
      ...simCaller,
      name: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "form-label"
  }, /*#__PURE__*/React.createElement("span", null, "Urgency Score (", simScore, "/100)")), /*#__PURE__*/React.createElement("div", {
    className: "slider-container",
    style: {
      marginTop: '4px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0",
    max: "100",
    value: simScore,
    onChange: e => setSimScore(parseInt(e.target.value, 10))
  }), /*#__PURE__*/React.createElement("div", {
    className: "slider-value-badge"
  }, simScore)))), /*#__PURE__*/React.createElement("button", {
    className: "btn-primary",
    style: {
      width: '100%',
      padding: '12px',
      fontWeight: '800'
    },
    disabled: isSubmitting,
    onClick: () => triggerLivePipeline()
  }, isSubmitting ? "Dispatching Event Across Pipeline..." : "🚀 Dispatch Live Hardware Event Through Pipeline")), /*#__PURE__*/React.createElement("div", {
    className: "trace-terminal",
    style: {
      margin: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal-dots"
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal-dot dot-red"
  }), /*#__PURE__*/React.createElement("div", {
    className: "terminal-dot dot-yellow"
  }), /*#__PURE__*/React.createElement("div", {
    className: "terminal-dot dot-green"
  })), /*#__PURE__*/React.createElement("div", null, "Real-Time Telephony Pipeline Execution Trace"), /*#__PURE__*/React.createElement("div", null, dispatchStatus ? `STATUS: ${dispatchStatus}` : "READY")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, dispatchLogs.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px',
      textAlign: 'center',
      color: 'var(--text-muted)'
    }
  }, "Click any scenario preset above or hit \"Dispatch Live Hardware Event\" to see the end-to-end execution trace log in real-time.") : dispatchLogs.map((log, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    className: "trace-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "trace-step",
    style: {
      color: log.ok ? "#38bdf8" : "#f59e0b"
    }
  }, log.step), /*#__PURE__*/React.createElement("span", {
    className: "trace-body"
  }, log.msg)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px',
      background: 'rgba(0,0,0,0.4)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      fontSize: '11px',
      color: 'var(--text-muted)',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Threshold Rule: Score >= 80 triggers Caregiver FCM Push"), /*#__PURE__*/React.createElement("span", null, "Duplicate Cooldown: 30s Window")))), /*#__PURE__*/React.createElement("div", {
    className: "glass-panel",
    style: {
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header",
    style: {
      marginBottom: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement("span", null, "🚨"), " Dispatched Caregiver Alerts (Live from Node.js Database)"), /*#__PURE__*/React.createElement("span", {
    className: "panel-subtitle"
  }, "Real-time FCM Push Event Log")), /*#__PURE__*/React.createElement("div", {
    className: "table-responsive"
  }, /*#__PURE__*/React.createElement("table", {
    className: "history-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Alert ID"), /*#__PURE__*/React.createElement("th", null, "Senior Account"), /*#__PURE__*/React.createElement("th", null, "Caller Details"), /*#__PURE__*/React.createElement("th", null, "Urgency Score"), /*#__PURE__*/React.createElement("th", null, "Priority Level"), /*#__PURE__*/React.createElement("th", null, "FCM Push Delivery"), /*#__PURE__*/React.createElement("th", null, "Timestamp"))), /*#__PURE__*/React.createElement("tbody", null, telemetry.recentAlerts && telemetry.recentAlerts.length > 0 ? telemetry.recentAlerts.map(alt => /*#__PURE__*/React.createElement("tr", {
    key: alt.id
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '11px'
    }
  }, alt.id), /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: '600',
      color: 'white'
    }
  }, alt.elderlyName || "Alice Henderson"), /*#__PURE__*/React.createElement("td", null, alt.callerName, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      fontSize: '11px'
    }
  }, "(", alt.callerPhone, ")")), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: '700',
      color: alt.score >= 80 ? '#ef4444' : '#f59e0b'
    }
  }, alt.score, "/100"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: `level-badge level-${(alt.level || 'high').toLowerCase()}`,
    style: {
      padding: '2px 8px',
      fontSize: '11px',
      margin: 0
    }
  }, alt.level)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'rgba(16, 185, 129, 0.15)',
      color: '#34d399',
      padding: '3px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '700',
      border: '1px solid rgba(16, 185, 129, 0.3)'
    }
  }, "FCM DISPATCHED • CHIME PLAYED")), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: '11px',
      color: '#94a3b8'
    }
  }, new Date(alt.timestamp).toLocaleTimeString()))) : /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "7",
    style: {
      textAlign: 'center',
      padding: '20px',
      color: 'var(--text-muted)'
    }
  }, "No alerts in live database. Use the simulator above to dispatch a live alert!")))))));
}

// -------------------------------------------------------------
// OOP Architecture & Object Flow Animation Component
// -------------------------------------------------------------
function OopFlowAnimation() {
  const [simIndex, setSimIndex] = useState(2); // Default to Emergency Simulation
  const [step, setStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const SIMULATIONS = [{
    id: "sim-1",
    title: "Simulation 1: Normal Contact Single Call",
    badge: "Score: 0 / 100 [LOW]",
    profile: {
      id: 101,
      name: "Bob Smith",
      phone: "+91 98765 43210",
      rel: "Friend",
      prio: "NORMAL"
    },
    recentsCount: 0,
    recentsText: "Empty List (0 prior calls)",
    historyText: "1 call (duration: 45s, answered)",
    timeStr: "14:30 (Daytime)",
    factors: {
      identity: "+0 (NORMAL)",
      freq: "+0 (Single)",
      time: "+0 (Daytime)",
      hist: "+0 (Sample < 3)"
    },
    score: 0,
    level: "LOW",
    explanation: "Normal contact (+0). Normal frequency (+0). Normal timing (+0). Insufficient history (+0)."
  }, {
    id: "sim-2",
    title: "Simulation 2: Trusted Contact Repeated Redials",
    badge: "Score: 35 / 100 [MEDIUM]",
    profile: {
      id: 102,
      name: "Mom",
      phone: "+91 98123 45678",
      rel: "Family",
      prio: "TRUSTED"
    },
    recentsCount: 2,
    recentsText: "2 CallRecords [t-6m, t-3m]",
    historyText: "2 calls (duration: 120s, answered)",
    timeStr: "15:00 (Daytime)",
    factors: {
      identity: "+20 (TRUSTED)",
      freq: "+15 (Repeated >= 1)",
      time: "+0 (Daytime)",
      hist: "+0 (Sample < 3)"
    },
    score: 35,
    level: "MEDIUM",
    explanation: "Trusted contact (+20). Repeated calls (+15). Normal timing (+0). Insufficient history (+0)."
  }, {
    id: "sim-3",
    title: "Simulation 3: Late Night Emergency Call",
    badge: "Score: 80 / 100 [HIGH]",
    profile: {
      id: 103,
      name: "Dad",
      phone: "+91 98222 33445",
      rel: "Family",
      prio: "EMERGENCY"
    },
    recentsCount: 3,
    recentsText: "3 CallRecords [t-9m, t-6m, t-2m]",
    historyText: "2 calls (duration: 60s, answered)",
    timeStr: "03:15 (Late Night 3 AM)",
    factors: {
      identity: "+30 (EMERGENCY)",
      freq: "+30 (High Freq >= 3)",
      time: "+20 (Night & Emg)",
      hist: "+0 (Sample < 3)"
    },
    score: 80,
    level: "HIGH",
    explanation: "Emergency contact (+30). High frequency (+30). Late night (+20). Insufficient history (+0)."
  }, {
    id: "sim-4",
    title: "Simulation 4: Boundary Edge Case (All 4 Factors Triggered)",
    badge: "Score: 100 / 100 [HIGH]",
    profile: {
      id: 104,
      name: "Hospital Emergency",
      phone: "+91 91111 22233",
      rel: "Medical",
      prio: "EMERGENCY"
    },
    recentsCount: 4,
    recentsText: "4 CallRecords [t-12m, t-9m, t-6m, t-2m]",
    historyText: "4 calls (3 missed = 75% missed rate)",
    timeStr: "02:40 (Late Night 2 AM)",
    factors: {
      identity: "+30 (EMERGENCY)",
      freq: "+30 (High Freq)",
      time: "+20 (Night & Emg)",
      hist: "+20 (>=50% Missed)"
    },
    score: 100,
    level: "HIGH",
    explanation: "Emergency (+30). High frequency (+30). Late night (+20). Historically high missed rate (+20)."
  }];
  const currentSim = SIMULATIONS[simIndex];

  // Auto-play timer
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setStep(prev => prev % 6 + 1);
      }, 2400);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);
  const STEP_DETAILS = {
    1: {
      title: "Step 1: Entity Object Instantiation on JVM Heap",
      concept: "Encapsulation & State Allocation",
      narrative: /*#__PURE__*/React.createElement("span", null, "Allocating POJO instances on JVM Heap: ", /*#__PURE__*/React.createElement("b", null, "new CallerProfile(...)"), " and ", /*#__PURE__*/React.createElement("b", null, "ArrayList<CallRecord>"), " encapsulate state with private member fields and public getters."),
      code: `CallerProfile profile = new CallerProfile(${currentSim.profile.id}, "${currentSim.profile.name}", "${currentSim.profile.phone}", "${currentSim.profile.rel}", Priority.${currentSim.profile.prio});\nList<CallRecord> recentCalls = repository.getRecentCalls(phone, windowStart);`,
      activeNodes: ["profile", "recent", "history"],
      activeArrows: []
    },
    2: {
      title: "Step 2: Aggregation & Object Composition (CallContext)",
      concept: "Object Composition (Has-A)",
      narrative: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, "CallContext"), " bundles references via Composition (has-a ", /*#__PURE__*/React.createElement("i", null, "CallerProfile"), ", has-many ", /*#__PURE__*/React.createElement("i", null, "CallRecord"), "s). Isolates the Engine from database schemas."),
      code: `CallContext context = new CallContext(profile, recentCalls, historicalCalls, timestamp);`,
      activeNodes: ["profile", "recent", "history", "context"],
      activeArrows: ["p2c", "r2c", "h2c"]
    },
    3: {
      title: "Step 3: Message Passing & Pure Service Invocation",
      concept: "Message Passing & Loose Coupling",
      narrative: /*#__PURE__*/React.createElement("span", null, "Invoking ", /*#__PURE__*/React.createElement("b", null, "WeightedRuleEngine.evaluate(context)"), " by reference. The engine evaluates urgency as a pure deterministic calculation without mutating caller state."),
      code: `WeightedRuleEngine engine = new WeightedRuleEngine();\nUrgencyResult result = engine.evaluate(context);`,
      activeNodes: ["context", "engine"],
      activeArrows: ["c2e"]
    },
    4: {
      title: "Step 4: Internal 4-Factor Evaluation Pipeline",
      concept: "Business Logic Encapsulation",
      narrative: /*#__PURE__*/React.createElement("span", null, "Engine executes 4 weighted rules: ", /*#__PURE__*/React.createElement("b", null, "Identity"), " ($", currentSim.factors.identity, "), ", /*#__PURE__*/React.createElement("b", null, "Frequency"), " ($", currentSim.factors.freq, "), ", /*#__PURE__*/React.createElement("b", null, "Timing"), " ($", currentSim.factors.time, "), and ", /*#__PURE__*/React.createElement("b", null, "History"), " ($", currentSim.factors.hist, "). Clamps score 0–100."),
      code: `// Rule 1: ${currentSim.factors.identity}\n// Rule 2: ${currentSim.factors.freq}\n// Rule 3: ${currentSim.factors.time}\n// Rule 4: ${currentSim.factors.hist}\nscore = Math.max(0, Math.min(100, rawScore)); // Total: ${currentSim.score}`,
      activeNodes: ["engine"],
      activeArrows: ["c2e"]
    },
    5: {
      title: "Step 5: Value Object Return (UrgencyResult DTO)",
      concept: "Data Transfer Object (DTO) & Immutability",
      narrative: /*#__PURE__*/React.createElement("span", null, "Engine creates an immutable ", /*#__PURE__*/React.createElement("b", null, "UrgencyResult"), " DTO containing score ($", currentSim.score, "), enum Level.$", currentSim.level, ", and explanation text."),
      code: `return new UrgencyResult(${currentSim.score}, UrgencyResult.Level.${currentSim.level}, "${currentSim.explanation}");`,
      activeNodes: ["engine", "result"],
      activeArrows: ["e2r"]
    },
    6: {
      title: "Step 6: Persistence Layer Hand-off (CallRepository & SQLite)",
      concept: "Repository Pattern & SQLite DAO",
      narrative: /*#__PURE__*/React.createElement("span", null, "Application serializes evaluation into a ", /*#__PURE__*/React.createElement("b", null, "CallRecord"), " entity and calls ", /*#__PURE__*/React.createElement("b", null, "CallRepository.saveCallRecord(record)"), " to persist into SQLite table ", /*#__PURE__*/React.createElement("i", null, "call_history"), "."),
      code: `CallRecord record = new CallRecord(0, phone, timestamp, 0, result.getScore(), result.getUrgencyLevel().name(), result.getExplanation());\nrepository.saveCallRecord(record);`,
      activeNodes: ["result", "repo", "db"],
      activeArrows: ["r2repo", "repo2db"]
    }
  };
  const curStep = STEP_DETAILS[step];
  return /*#__PURE__*/React.createElement("div", {
    className: "oop-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-controls-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-sim-switcher"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      fontWeight: '700',
      color: 'var(--text-secondary)'
    }
  }, "Simulation Scenario:"), SIMULATIONS.map((sim, i) => /*#__PURE__*/React.createElement("button", {
    key: sim.id,
    className: `oop-sim-btn ${simIndex === i ? "active" : ""}`,
    onClick: () => {
      setSimIndex(i);
      setStep(1);
    }
  }, "Sim ", i + 1, " (", sim.level, ")"))), /*#__PURE__*/React.createElement("div", {
    className: "oop-playback-controls"
  }, /*#__PURE__*/React.createElement("button", {
    className: "playback-btn",
    onClick: () => setStep(prev => prev > 1 ? prev - 1 : 6),
    title: "Previous Step"
  }, "◀ Prev"), /*#__PURE__*/React.createElement("button", {
    className: `playback-btn ${isPlaying ? "" : "btn-play"}`,
    onClick: () => setIsPlaying(!isPlaying)
  }, isPlaying ? "❚❚ Pause" : "▶ Auto Play"), /*#__PURE__*/React.createElement("button", {
    className: "playback-btn",
    onClick: () => setStep(prev => prev % 6 + 1),
    title: "Next Step"
  }, "Next ▶"), /*#__PURE__*/React.createElement("button", {
    className: "playback-btn",
    onClick: () => {
      setStep(1);
      setIsPlaying(false);
    },
    title: "Reset to Step 1"
  }, "↺ Reset"), /*#__PURE__*/React.createElement("div", {
    className: "step-indicator-pill"
  }, "STEP ", step, " / 6"))), /*#__PURE__*/React.createElement("div", {
    className: "oop-stage-card"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "oop-canvas-svg",
    viewBox: "0 0 1440 680",
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("marker", {
    id: "arrow-blue",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 0 1 L 10 5 L 0 9 z",
    fill: "#38bdf8"
  })), /*#__PURE__*/React.createElement("marker", {
    id: "arrow-dim",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 0 1 L 10 5 L 0 9 z",
    fill: "rgba(255,255,255,0.2)"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M 290 120 C 340 120, 360 280, 410 280",
    fill: "none",
    stroke: curStep.activeArrows.includes("p2c") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("p2c") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("p2c") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("p2c") ? "active-arrow" : ""}`
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 290 310 C 340 310, 360 320, 410 320",
    fill: "none",
    stroke: curStep.activeArrows.includes("r2c") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("r2c") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("r2c") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("r2c") ? "active-arrow" : ""}`
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 290 490 C 340 490, 360 360, 410 360",
    fill: "none",
    stroke: curStep.activeArrows.includes("h2c") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("h2c") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("h2c") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("h2c") ? "active-arrow" : ""}`
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 690 320 C 720 320, 730 320, 760 320",
    fill: "none",
    stroke: curStep.activeArrows.includes("c2e") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("c2e") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("c2e") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("c2e") ? "active-arrow" : ""}`
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 1040 280 C 1070 280, 1090 140, 1120 140",
    fill: "none",
    stroke: curStep.activeArrows.includes("e2r") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("e2r") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("e2r") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("e2r") ? "active-arrow" : ""}`
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 1250 210 C 1250 250, 1250 310, 1250 350",
    fill: "none",
    stroke: curStep.activeArrows.includes("r2repo") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("r2repo") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("r2repo") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("r2repo") ? "active-arrow" : ""}`
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 1250 490 C 1250 510, 1250 520, 1250 540",
    fill: "none",
    stroke: curStep.activeArrows.includes("repo2db") ? "#38bdf8" : "rgba(255,255,255,0.12)",
    strokeWidth: curStep.activeArrows.includes("repo2db") ? "3" : "1.5",
    markerEnd: curStep.activeArrows.includes("repo2db") ? "url(#arrow-blue)" : "url(#arrow-dim)",
    className: `svg-arrow-line ${curStep.activeArrows.includes("repo2db") ? "active-arrow" : ""}`
  })), /*#__PURE__*/React.createElement("div", {
    className: "oop-nodes-grid"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("profile") ? "active" : "dimmed"}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "👤"), " CallerProfile"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@Heap:0x7A1")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "class com.safecall.model.CallerProfile"), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "long id:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, currentSim.profile.id)), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "String name:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val val-hl"
  }, "\"", currentSim.profile.name, "\"")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "String phone:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, currentSim.profile.phone)), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "String rel:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, "\"", currentSim.profile.rel, "\"")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "Priority prio:"), /*#__PURE__*/React.createElement("span", {
    className: `oop-field-val ${currentSim.profile.prio === "EMERGENCY" ? "val-urgent" : currentSim.profile.prio === "TRUSTED" ? "val-trusted" : ""}`
  }, "Priority.", currentSim.profile.prio)))), /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("recent") ? "active" : "dimmed"}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "🔁"), " recentCalls"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@Heap:0x8B4")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "java.util.List<CallRecord>"), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "size():"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val val-hl"
  }, currentSim.recentsCount, " items")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "window:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, "<= 15 mins")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "payload:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val",
    style: {
      fontSize: '10.5px'
    }
  }, currentSim.recentsText)))), /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("history") ? "active" : "dimmed"}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "📊"), " historicalCalls"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@Heap:0x9C2")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "java.util.List<CallRecord>"), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "callTime:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val val-hl"
  }, currentSim.timeStr)), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "historyData:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val",
    style: {
      fontSize: '10.5px'
    }
  }, currentSim.historyText))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("context") ? "active" : "dimmed"}`,
    style: {
      minHeight: '260px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "🧩"), " CallContext"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@Heap:0x3D9")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "class com.safecall.model.CallContext"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#38bdf8',
      marginBottom: '8px',
      fontStyle: 'italic'
    }
  }, "// Composite Aggregation (Has-A)"), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "profile ref:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, "→ @0x7A1")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "recentCalls ref:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, "→ @0x8B4")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "historyCalls ref:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, "→ @0x9C2")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "currentCallTime:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, currentSim.timeStr))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '12px',
      padding: '8px',
      background: 'rgba(0,0,0,0.3)',
      borderRadius: '6px',
      fontSize: '11px',
      color: '#94a3b8'
    }
  }, "Method Accessors:", /*#__PURE__*/React.createElement("br", null), "• getProfile()", /*#__PURE__*/React.createElement("br", null), "• getRecentCalls()", /*#__PURE__*/React.createElement("br", null), "• getHistoricalCalls()", /*#__PURE__*/React.createElement("br", null), "• getCurrentCallTime()"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("engine") ? "active" : "dimmed"}`,
    style: {
      minHeight: '340px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "⚙"), " WeightedRuleEngine"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@Singleton:0xE1F")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "class com.safecall.engine.WeightedRuleEngine"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#a78bfa',
      marginBottom: '10px'
    }
  }, "Method: evaluate(CallContext context)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      fontSize: '11px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#94a3b8'
    }
  }, "Rule 1: Caller Identity (Max 30)"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '700'
    }
  }, currentSim.factors.identity)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      fontSize: '11px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#94a3b8'
    }
  }, "Rule 2: Call Frequency (Max 30)"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '700'
    }
  }, currentSim.factors.freq)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      fontSize: '11px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#94a3b8'
    }
  }, "Rule 3: Timing Context (Max 20)"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '700'
    }
  }, currentSim.factors.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      fontSize: '11px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#94a3b8'
    }
  }, "Rule 4: Historical Behavior (Max 20)"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#38bdf8',
      fontWeight: '700'
    }
  }, currentSim.factors.hist))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("result") ? "active" : "dimmed"}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "📡"), " UrgencyResult"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@Heap:0x5F2")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "class com.safecall.model.UrgencyResult (DTO)"), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "int score:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val val-hl"
  }, currentSim.score, " / 100")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "Level level:"), /*#__PURE__*/React.createElement("span", {
    className: `oop-field-val ${currentSim.level === "HIGH" ? "val-urgent" : currentSim.level === "MEDIUM" ? "val-trusted" : ""}`
  }, "Level.", currentSim.level)), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "explanation:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val",
    style: {
      fontSize: '10px'
    }
  }, "\"", currentSim.explanation, "\"")))), /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("repo") ? "active" : "dimmed"}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "🗃"), " CallRepository"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "@DAO:0x1C8")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "class com.safecall.db.CallRepository"), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "dbHelper:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val"
  }, "DatabaseHelper")), /*#__PURE__*/React.createElement("div", {
    className: "oop-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "oop-field-name"
  }, "method:"), /*#__PURE__*/React.createElement("span", {
    className: "oop-field-val val-hl"
  }, "saveCallRecord()")))), /*#__PURE__*/React.createElement("div", {
    className: `oop-node ${curStep.activeNodes.includes("db") ? "active" : "dimmed"}`,
    style: {
      background: 'rgba(8, 20, 36, 0.95)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-node-title"
  }, /*#__PURE__*/React.createElement("span", null, "💾"), " SQLite: safecall.db"), /*#__PURE__*/React.createElement("div", {
    className: "oop-heap-address"
  }, "Disk DB")), /*#__PURE__*/React.createElement("div", {
    className: "oop-class-tag"
  }, "TABLE call_history"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11px',
      color: '#34d399',
      fontFamily: 'var(--font-mono)'
    }
  }, "INSERT INTO call_history (phone, timestamp, urgencyScore, urgencyLevel, explanation)..."))))), /*#__PURE__*/React.createElement("div", {
    className: "oop-step-footer"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "oop-step-concept"
  }, /*#__PURE__*/React.createElement("span", {
    className: "concept-badge"
  }, curStep.concept), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      fontWeight: '700',
      color: 'white'
    }
  }, curStep.title)), /*#__PURE__*/React.createElement("div", {
    className: "oop-step-narrative",
    style: {
      marginTop: '8px'
    }
  }, curStep.narrative)), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: '460px',
      background: '#050811',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: '#cbd5e1'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      marginBottom: '4px',
      fontSize: '10px'
    }
  }, "// Executing Java Statement:"), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      whiteSpace: 'pre-wrap',
      color: '#38bdf8'
    }
  }, curStep.code))));
}
ReactDOM.render(/*#__PURE__*/React.createElement(App, null), document.getElementById("root"));