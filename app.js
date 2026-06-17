// app.js
//
// Single-file SPA logic for the Exam Maker site.
// Routes (hash-based, no server needed):
//   #/                     -> home
//   #/create                -> paste JSON, create exam
//   #/exam/<examId>          -> take the exam
//   #/results/<examId>       -> view all responses (owner view)
//
// Data model in Firestore:
//   exams/{examId}            { title, questions: [{id, question, options}], createdAt, ownerToken }
//   exams/{examId}/responses/{responseId}  { name, email, answers: {qId: optionIndex}, submittedAt }

(function () {
  const appEl = document.getElementById('app');
  const configBanner = document.getElementById('configBanner');

  // ---------- Firebase init ----------
  let db = null;
  let firebaseReady = false;

  function isConfigFilled(cfg) {
    if (!cfg) return false;
    return !Object.values(cfg).some((v) => typeof v === 'string' && v.startsWith('PASTE_'));
  }

  try {
    const cfg = window.__FIREBASE_CONFIG__;
    if (isConfigFilled(cfg)) {
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      firebaseReady = true;
    } else {
      configBanner.style.display = 'block';
    }
  } catch (e) {
    console.error('Firebase init failed', e);
    configBanner.style.display = 'block';
  }

  // ---------- Utilities ----------
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function genId(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function optionLabel(i) {
    const labels = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'];
    return labels[i] || String(i + 1);
  }

  function getOwnerTokens() {
    try {
      return JSON.parse(localStorage.getItem('examOwnerTokens') || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveOwnerToken(examId, token) {
    const tokens = getOwnerTokens();
    tokens[examId] = token;
    localStorage.setItem('examOwnerTokens', JSON.stringify(tokens));
  }
  function getMyExams() {
    try {
      return JSON.parse(localStorage.getItem('myExams') || '[]');
    } catch (e) {
      return [];
    }
  }
  function addMyExam(examId, title) {
    const list = getMyExams();
    list.unshift({ id: examId, title, createdAt: Date.now() });
    localStorage.setItem('myExams', JSON.stringify(list.slice(0, 50)));
  }

  // ---------- Router ----------
  function getRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { name: 'home' };
    if (parts[0] === 'create') return { name: 'create' };
    if (parts[0] === 'exam' && parts[1]) return { name: 'exam', examId: parts[1] };
    if (parts[0] === 'results' && parts[1]) return { name: 'results', examId: parts[1] };
    if (parts[0] === 'my-exams') return { name: 'my-exams' };
    return { name: 'home' };
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);

  function render() {
    const route = getRoute();
    if (route.name === 'home') return renderHome();
    if (route.name === 'create') return renderCreate();
    if (route.name === 'exam') return renderTakeExam(route.examId);
    if (route.name === 'results') return renderResults(route.examId);
    if (route.name === 'my-exams') return renderMyExams();
  }

  function masthead() {
    return `
      <div class="masthead">
        <a href="#/" class="brand"><span class="mark"></span>পরীক্ষা প্রস্তুতকারক</a>
        <span class="tag">EXAM MAKER · ONLINE QUIZ</span>
      </div>
    `;
  }

  // ---------- HOME ----------
  function renderHome() {
    appEl.innerHTML = `
      ${masthead()}
      <div class="container">
        <div class="eyebrow">শুরু করুন</div>
        <h1 class="title">JSON থেকে অনলাইন পরীক্ষা তৈরি করুন</h1>
        <p class="lede">এক্সটেনশন থেকে কপি করা JSON পেস্ট করে একটি শেয়ারযোগ্য পরীক্ষার লিংক তৈরি করুন। শিক্ষার্থীরা লিংকে গিয়ে পরীক্ষা দিতে পারবে, এবং সব উত্তর এখানেই দেখতে পারবেন।</p>

        <div class="home-grid">
          <a href="#/create" class="home-card" style="text-decoration:none;">
            <div class="num">০১</div>
            <h3>নতুন পরীক্ষা তৈরি করুন</h3>
            <p>প্রশ্নের JSON পেস্ট করুন, একটি লিংক পাবেন — সেটাই শেয়ার করুন।</p>
            <span class="btn btn-primary btn-block">তৈরি করুন →</span>
          </a>
          <a href="#/my-exams" class="home-card" style="text-decoration:none;">
            <div class="num">০২</div>
            <h3>আমার পরীক্ষাগুলো</h3>
            <p>আগে তৈরি করা পরীক্ষার উত্তর ও রেজাল্ট দেখুন (এই ব্রাউজারে তৈরি করা পরীক্ষাগুলো)।</p>
            <span class="btn btn-outline btn-block">দেখুন →</span>
          </a>
        </div>
      </div>
    `;
  }

  // ---------- MY EXAMS (local list of exams created on this browser) ----------
  function renderMyExams() {
    const list = getMyExams();
    const itemsHtml = list.length
      ? list.map((e) => `
          <div class="qpreview-item">
            <span class="qnum">${new Date(e.createdAt).toLocaleDateString('bn-BD')}</span>
            <span class="qtext">${escapeHtml(e.title || 'শিরোনামহীন পরীক্ষা')}</span>
            <div class="opts">
              <a href="#/results/${e.id}" class="answer-detail-toggle">রেজাল্ট দেখুন</a>
              <a href="#/exam/${e.id}" class="answer-detail-toggle">পরীক্ষাটি দেখুন</a>
            </div>
          </div>
        `).join('')
      : `<div class="empty-state"><div class="glyph">📭</div>এই ব্রাউজারে এখনো কোনো পরীক্ষা তৈরি করা হয়নি।</div>`;

    appEl.innerHTML = `
      ${masthead()}
      <div class="container">
        <div class="eyebrow">আর্কাইভ</div>
        <h1 class="title">আমার পরীক্ষাগুলো</h1>
        <p class="lede">এই তালিকা শুধু এই ব্রাউজারে সংরক্ষিত — অন্য ডিভাইস থেকে এক্সেস হবে না। পরীক্ষার লিংক (#/results/...) বুকমার্ক করে রাখাই সবচেয়ে নিরাপদ।</p>
        <div class="sheet">${itemsHtml}</div>
        <p style="margin-top:20px;"><a href="#/create" class="btn-ghost">+ নতুন পরীক্ষা তৈরি করুন</a></p>
      </div>
    `;
  }

  // ---------- CREATE ----------
  function renderCreate() {
    appEl.innerHTML = `
      ${masthead()}
      <div class="container">
        <div class="eyebrow">নতুন পরীক্ষা</div>
        <h1 class="title">প্রশ্নের JSON পেস্ট করুন</h1>
        <p class="lede">এক্সটেনশন থেকে কপি করা JSON এখানে পেস্ট করুন। চাইলে হাতে লিখেও দিতে পারেন (ফরম্যাট নিচে দেখুন)।</p>

        <div class="sheet">
          <div class="field">
            <label class="field-label" for="examTitleInput">পরীক্ষার শিরোনাম</label>
            <input type="text" id="examTitleInput" placeholder="যেমন: কম্পিউটার - অধ্যায় ৩ - মডেল টেস্ট" />
          </div>

          <div class="field">
            <label class="field-label" for="jsonInput">প্রশ্নের JSON</label>
            <textarea id="jsonInput" placeholder='{
  &quot;questions&quot;: [
    {
      &quot;question&quot;: &quot;প্রশ্নের লেখা&quot;,
      &quot;options&quot;: [&quot;অপশন ১&quot;, &quot;অপশন ২&quot;, &quot;অপশন ৩&quot;, &quot;অপশন ৪&quot;]
    }
  ]
}'></textarea>
            <div class="hint">এক্সটেনশন থেকে কপি করা JSON সরাসরি এখানে পেস্ট করুন (Ctrl+V)।</div>
          </div>

          <button class="btn btn-primary" id="parseBtn">প্রিভিউ দেখুন</button>
          <div id="parseStatus" class="status-msg"></div>

          <div id="previewWrap" style="display:none;">
            <h2 class="section-title" style="margin-top:28px;">প্রিভিউ</h2>
            <div id="qpreviewList" class="qpreview-list"></div>
            <button class="btn btn-primary" id="publishBtn" style="margin-top:20px;">পরীক্ষা প্রকাশ করুন ও লিংক তৈরি করুন</button>
          </div>

          <div id="publishResult"></div>
        </div>
      </div>
    `;

    let parsedQuestions = null;

    document.getElementById('parseBtn').addEventListener('click', () => {
      const raw = document.getElementById('jsonInput').value.trim();
      const statusEl = document.getElementById('parseStatus');
      const previewWrap = document.getElementById('previewWrap');
      statusEl.className = 'status-msg';
      previewWrap.style.display = 'none';

      if (!raw) {
        statusEl.textContent = 'কোনো JSON পেস্ট করা হয়নি।';
        statusEl.className = 'status-msg error show';
        return;
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        statusEl.textContent = 'JSON পার্স করা যায়নি। ফরম্যাট ঠিক আছে কিনা দেখুন। (' + e.message + ')';
        statusEl.className = 'status-msg error show';
        return;
      }

      let questions = Array.isArray(data) ? data : data.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        statusEl.textContent = 'JSON-এ কোনো প্রশ্ন পাওয়া যায়নি। "questions" নামে একটি অ্যারে থাকা উচিত।';
        statusEl.className = 'status-msg error show';
        return;
      }

      // Normalize + validate each question
      const normalized = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qText = (q.question || q.text || '').toString().trim();
        const opts = Array.isArray(q.options) ? q.options.filter(Boolean) : [];
        if (!qText || opts.length < 2) continue;
        normalized.push({ id: i + 1, question: qText, options: opts });
      }

      if (normalized.length === 0) {
        statusEl.textContent = 'কোনো বৈধ প্রশ্ন পাওয়া যায়নি (প্রতিটি প্রশ্নে অন্তত ২টি অপশন থাকা প্রয়োজন)।';
        statusEl.className = 'status-msg error show';
        return;
      }

      parsedQuestions = normalized;

      if (!document.getElementById('examTitleInput').value.trim() && data.examTitle) {
        document.getElementById('examTitleInput').value = data.examTitle;
      }

      statusEl.textContent = `${normalized.length}টি প্রশ্ন পাওয়া গেছে। নিচে প্রিভিউ দেখুন।`;
      statusEl.className = 'status-msg success show';

      const listEl = document.getElementById('qpreviewList');
      listEl.innerHTML = normalized.map((q) => `
        <div class="qpreview-item">
          <span class="qnum">প্রশ্ন ${q.id}</span>
          <div class="qtext">${escapeHtml(q.question)}</div>
          <div class="opts">
            ${q.options.map((o, idx) => `<span>${optionLabel(idx)}. ${escapeHtml(o)}</span>`).join('')}
          </div>
        </div>
      `).join('');

      previewWrap.style.display = 'block';
    });

    document.getElementById('publishBtn').addEventListener('click', async () => {
      if (!parsedQuestions) return;
      const publishBtn = document.getElementById('publishBtn');
      const resultEl = document.getElementById('publishResult');
      const title = document.getElementById('examTitleInput').value.trim() || 'শিরোনামহীন পরীক্ষা';

      if (!firebaseReady) {
        resultEl.innerHTML = `<div class="status-msg error show">Firebase কনফিগার করা হয়নি, তাই পরীক্ষা সংরক্ষণ করা যাচ্ছে না। পেজের উপরের নির্দেশনা দেখুন।</div>`;
        return;
      }

      publishBtn.disabled = true;
      publishBtn.innerHTML = `<span class="spinner"></span> প্রকাশ করা হচ্ছে...`;

      try {
        const examId = genId(8);
        const ownerToken = genId(16);

        await db.collection('exams').doc(examId).set({
          title,
          questions: parsedQuestions,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          ownerToken
        });

        saveOwnerToken(examId, ownerToken);
        addMyExam(examId, title);

        const examUrl = `${window.location.origin}${window.location.pathname}#/exam/${examId}`;
        const resultsUrl = `${window.location.origin}${window.location.pathname}#/results/${examId}`;

        resultEl.innerHTML = `
          <div class="status-msg success show">পরীক্ষা সফলভাবে প্রকাশিত হয়েছে!</div>
          <h2 class="section-title" style="margin-top:24px;">শেয়ার করুন</h2>
          <label class="field-label">পরীক্ষার লিংক (শিক্ষার্থীদের দিন)</label>
          <div class="link-box">
            <input type="text" readonly value="${examUrl}" id="examLinkInput" />
            <button class="btn btn-outline btn-sm" id="copyExamLink">কপি করুন</button>
          </div>
          <label class="field-label" style="margin-top:18px;">রেজাল্ট লিংক (শুধু আপনার জন্য)</label>
          <div class="link-box">
            <input type="text" readonly value="${resultsUrl}" id="resultsLinkInput" />
            <button class="btn btn-outline btn-sm" id="copyResultsLink">কপি করুন</button>
          </div>
          <p class="hint" style="margin-top:14px;">রেজাল্ট লিংকটি নিরাপদ রাখুন — এটি দিয়ে সব উত্তর দেখা যাবে।</p>
          <div class="row" style="margin-top:24px;">
            <a href="#/exam/${examId}" class="btn btn-outline">পরীক্ষাটি দেখুন</a>
            <a href="#/results/${examId}" class="btn btn-primary">রেজাল্ট ড্যাশবোর্ডে যান</a>
          </div>
        `;

        document.getElementById('copyExamLink').addEventListener('click', () => {
          navigator.clipboard.writeText(examUrl);
          document.getElementById('copyExamLink').textContent = 'কপি হয়েছে ✓';
        });
        document.getElementById('copyResultsLink').addEventListener('click', () => {
          navigator.clipboard.writeText(resultsUrl);
          document.getElementById('copyResultsLink').textContent = 'কপি হয়েছে ✓';
        });

      } catch (e) {
        console.error(e);
        resultEl.innerHTML = `<div class="status-msg error show">পরীক্ষা প্রকাশ করা যায়নি: ${escapeHtml(e.message)}</div>`;
      } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = 'পরীক্ষা প্রকাশ করুন ও লিংক তৈরি করুন';
      }
    });
  }

  // ---------- TAKE EXAM ----------
  async function renderTakeExam(examId) {
    appEl.innerHTML = `
      ${masthead()}
      <div class="container">
        <div class="center-screen"><span class="spinner" style="width:24px;height:24px;border-color:rgba(44,52,112,0.25);border-top-color:var(--indigo);"></span></div>
      </div>
    `;

    if (!firebaseReady) {
      appEl.innerHTML = `
        ${masthead()}
        <div class="container">
          <div class="sheet"><div class="status-msg error show">Firebase কনফিগার করা হয়নি, পরীক্ষা লোড করা যাচ্ছে না।</div></div>
        </div>
      `;
      return;
    }

    let examDoc;
    try {
      examDoc = await db.collection('exams').doc(examId).get();
    } catch (e) {
      appEl.innerHTML = `
        ${masthead()}
        <div class="container"><div class="sheet"><div class="status-msg error show">পরীক্ষা লোড করতে সমস্যা হয়েছে: ${escapeHtml(e.message)}</div></div></div>
      `;
      return;
    }

    if (!examDoc.exists) {
      appEl.innerHTML = `
        ${masthead()}
        <div class="container">
          <div class="empty-state"><div class="glyph">🔎</div>এই পরীক্ষাটি খুঁজে পাওয়া যায়নি। লিংকটি ঠিক আছে কিনা দেখুন।</div>
        </div>
      `;
      return;
    }

    const exam = examDoc.data();
    const questions = exam.questions || [];
    const answers = {};
    let studentName = '';
    let studentEmail = '';

    function renderIntake() {
      appEl.innerHTML = `
        ${masthead()}
        <div class="container">
          <div class="eyebrow">পরীক্ষার বিষয়</div>
          <h1 class="title">${escapeHtml(exam.title || 'পরীক্ষা')}</h1>
          <p class="lede">${questions.length}টি প্রশ্ন রয়েছে। শুরু করার আগে আপনার নাম দিন।</p>
          <div class="sheet">
            <div class="field">
              <label class="field-label" for="studentName">নাম *</label>
              <input type="text" id="studentName" placeholder="আপনার নাম লিখুন" />
            </div>
           
            <div id="intakeStatus" class="status-msg"></div>
            <button class="btn btn-primary btn-block" id="startBtn">পরীক্ষা শুরু করুন →</button>
          </div>
        </div>
      `;

      document.getElementById('startBtn').addEventListener('click', () => {
        const nameVal = document.getElementById('studentName').value.trim();
        const emailVal = document.getElementById('studentEmail').value.trim();
        const statusEl = document.getElementById('intakeStatus');
        if (!nameVal) {
          statusEl.textContent = 'অনুগ্রহ করে আপনার নাম লিখুন।';
          statusEl.className = 'status-msg error show';
          return;
        }
        studentName = nameVal;
        studentEmail = emailVal;
        renderQuestions();
      });
    }

    function renderQuestions() {
      const pct = Math.round((Object.keys(answers).length / questions.length) * 100);

      appEl.innerHTML = `
        ${masthead()}
        <div class="container">
          <div class="eyebrow">পরীক্ষা চলছে</div>
          <h1 class="title">${escapeHtml(exam.title || 'পরীক্ষা')}</h1>
          <p class="lede">${escapeHtml(studentName)}, নিচের প্রশ্নগুলোর উত্তর দিন এবং শেষে জমা দিন।</p>

          <div class="progress-bar"><div class="fill" id="progressFill" style="width:${pct}%;"></div></div>

          <div class="sheet" id="questionsSheet">
            ${questions.map((q, qIdx) => `
              <div class="qcard">
                <div class="qhead">
                  <span class="qno">${qIdx + 1}.</span>
                  <span class="qtext">${escapeHtml(q.question)}</span>
                </div>
                <div class="opt-list" data-qid="${q.id}">
                  ${q.options.map((opt, optIdx) => `
                    <label class="opt-row" data-qid="${q.id}" data-optidx="${optIdx}">
                      <input type="radio" name="q_${q.id}" value="${optIdx}" />
                      <span class="opt-label">${optionLabel(optIdx)}.</span>
                      <span class="opt-text">${escapeHtml(opt)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            `).join('')}

            <div id="submitStatus" class="status-msg"></div>
            <button class="btn btn-primary btn-block" id="submitExamBtn">পরীক্ষা জমা দিন</button>
          </div>
        </div>
      `;

      document.querySelectorAll('.opt-row').forEach((row) => {
        row.addEventListener('click', () => {
          const qid = row.getAttribute('data-qid');
          const optIdx = parseInt(row.getAttribute('data-optidx'), 10);
          answers[qid] = optIdx;

          document.querySelectorAll(`.opt-row[data-qid="${qid}"]`).forEach((r) => r.classList.remove('selected'));
          row.classList.add('selected');
          row.querySelector('input[type="radio"]').checked = true;

          const newPct = Math.round((Object.keys(answers).length / questions.length) * 100);
          const fill = document.getElementById('progressFill');
          if (fill) fill.style.width = newPct + '%';
        });
      });

      document.getElementById('submitExamBtn').addEventListener('click', async () => {
        const statusEl = document.getElementById('submitStatus');
        const unanswered = questions.length - Object.keys(answers).length;

        if (unanswered > 0) {
          const proceed = confirm(`${unanswered}টি প্রশ্নের উত্তর দেওয়া হয়নি। তবুও জমা দিতে চান?`);
          if (!proceed) return;
        }

        const submitBtn = document.getElementById('submitExamBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> জমা দেওয়া হচ্ছে...`;

        const answerPayload = questions.map((q) => ({
          questionId: q.id,
          question: q.question,
          selectedIndex: answers[q.id] !== undefined ? answers[q.id] : null,
          selectedText: answers[q.id] !== undefined ? q.options[answers[q.id]] : null
        }));

        try {
          await db.collection('exams').doc(examId).collection('responses').add({
            name: studentName,
            email: studentEmail || null,
            answers: answerPayload,
            answeredCount: Object.keys(answers).length,
            totalQuestions: questions.length,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          appEl.innerHTML = `
            ${masthead()}
            <div class="container">
              <div class="center-screen">
                <div class="sheet" style="text-align:center; max-width:480px;">
                  <div class="glyph" style="font-size:2.4rem; margin-bottom:10px;">✓</div>
                  <h1 class="title" style="font-size:1.5rem;">ধন্যবাদ, ${escapeHtml(studentName)}!</h1>
                  <p class="lede">আপনার উত্তর সফলভাবে জমা হয়েছে।</p>
                </div>
              </div>
            </div>
          `;
        } catch (e) {
          console.error(e);
          statusEl.textContent = 'জমা দিতে সমস্যা হয়েছে: ' + e.message;
          statusEl.className = 'status-msg error show';
          submitBtn.disabled = false;
          submitBtn.textContent = 'পরীক্ষা জমা দিন';
        }
      });
    }

    renderIntake();
  }

  // ---------- RESULTS DASHBOARD ----------
  async function renderResults(examId) {
    appEl.innerHTML = `
      ${masthead()}
      <div class="container">
        <div class="center-screen"><span class="spinner" style="width:24px;height:24px;border-color:rgba(44,52,112,0.25);border-top-color:var(--indigo);"></span></div>
      </div>
    `;

    if (!firebaseReady) {
      appEl.innerHTML = `
        ${masthead()}
        <div class="container"><div class="sheet"><div class="status-msg error show">Firebase কনফিগার করা হয়নি।</div></div></div>
      `;
      return;
    }

    let examDoc;
    try {
      examDoc = await db.collection('exams').doc(examId).get();
    } catch (e) {
      appEl.innerHTML = `${masthead()}<div class="container"><div class="sheet"><div class="status-msg error show">লোড করতে সমস্যা: ${escapeHtml(e.message)}</div></div></div>`;
      return;
    }

    if (!examDoc.exists) {
      appEl.innerHTML = `${masthead()}<div class="container"><div class="empty-state"><div class="glyph">🔎</div>পরীক্ষাটি খুঁজে পাওয়া যায়নি।</div></div>`;
      return;
    }

    const exam = examDoc.data();

    let responsesSnap;
    try {
      responsesSnap = await db.collection('exams').doc(examId).collection('responses')
        .orderBy('submittedAt', 'desc').get();
    } catch (e) {
      responsesSnap = await db.collection('exams').doc(examId).collection('responses').get();
    }

    const responses = [];
    responsesSnap.forEach((doc) => responses.push(Object.assign({ id: doc.id }, doc.data())));

    const examUrl = `${window.location.origin}${window.location.pathname}#/exam/${examId}`;

    const avgAnswered = responses.length
      ? Math.round(responses.reduce((sum, r) => sum + (r.answeredCount || 0), 0) / responses.length)
      : 0;

    const tableRows = responses.map((r) => {
      const submitted = r.submittedAt && r.submittedAt.toDate ? r.submittedAt.toDate() : null;
      const submittedStr = submitted ? submitted.toLocaleString('bn-BD') : '—';
      const detailId = 'detail_' + r.id;

      const detailHtml = (r.answers || []).map((a, idx) => `
        <div class="ad-item">
          <div class="ad-q">${idx + 1}. ${escapeHtml(a.question)}</div>
          <div class="ad-a">${a.selectedText ? escapeHtml(a.selectedText) : '(উত্তর দেওয়া হয়নি)'}</div>
        </div>
      `).join('');

      return `
        <tr>
          <td>${escapeHtml(r.name || '—')}</td>
          <td>${escapeHtml(r.email || '—')}</td>
          <td>${r.answeredCount || 0} / ${r.totalQuestions || (exam.questions || []).length}</td>
          <td>${submittedStr}</td>
          <td><span class="answer-detail-toggle" data-target="${detailId}">উত্তর দেখুন</span></td>
        </tr>
        <tr>
          <td colspan="5" style="padding:0; border-bottom:1px solid var(--rule);">
            <div class="answer-detail" id="${detailId}" style="margin:0 12px 12px;">${detailHtml}</div>
          </td>
        </tr>
      `;
    }).join('');

    appEl.innerHTML = `
      ${masthead()}
      <div class="container">
        <div class="eyebrow">রেজাল্ট ড্যাশবোর্ড</div>
        <h1 class="title">${escapeHtml(exam.title || 'পরীক্ষা')}</h1>
        <p class="lede">নিচে সব শিক্ষার্থীর উত্তর দেখুন।</p>

        <div class="stat-row">
          <div class="stat-box"><div class="stat-num">${responses.length}</div><div class="stat-label">মোট জমা</div></div>
          <div class="stat-box"><div class="stat-num">${(exam.questions || []).length}</div><div class="stat-label">মোট প্রশ্ন</div></div>
          <div class="stat-box"><div class="stat-num">${avgAnswered}</div><div class="stat-label">গড় উত্তরকৃত প্রশ্ন</div></div>
        </div>

        <div class="sheet">
          <div class="link-box" style="margin-top:0; margin-bottom:10px;">
            <input type="text" readonly value="${examUrl}" />
            <button class="btn btn-outline btn-sm" id="copyShareLink">লিংক কপি করুন</button>
          </div>

          ${responses.length === 0 ? `
            <div class="empty-state"><div class="glyph">📭</div>এখনো কেউ পরীক্ষা দেয়নি। লিংক শেয়ার করুন।</div>
          ` : `
            <div style="overflow-x:auto;">
              <table class="results-table">
                <thead>
                  <tr><th>নাম</th><th>ইমেইল</th><th>উত্তরকৃত</th><th>জমার সময়</th><th></th></tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
            <button class="btn btn-outline btn-sm" id="exportCsvBtn" style="margin-top:20px;">CSV ডাউনলোড করুন</button>
          `}
        </div>
      </div>
    `;

    document.getElementById('copyShareLink').addEventListener('click', () => {
      navigator.clipboard.writeText(examUrl);
      document.getElementById('copyShareLink').textContent = 'কপি হয়েছে ✓';
    });

    document.querySelectorAll('.answer-detail-toggle[data-target]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = document.getElementById(el.getAttribute('data-target'));
        if (target) target.classList.toggle('show');
      });
    });

    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const headers = ['Name', 'Email', 'Answered', 'Submitted At'].concat((exam.questions || []).map((q, i) => `Q${i + 1}`));
        const rows = responses.map((r) => {
          const submitted = r.submittedAt && r.submittedAt.toDate ? r.submittedAt.toDate().toISOString() : '';
          const answerMap = {};
          (r.answers || []).forEach((a) => { answerMap[a.questionId] = a.selectedText || ''; });
          const qCols = (exam.questions || []).map((q) => answerMap[q.id] || '');
          return [r.name || '', r.email || '', r.answeredCount || 0, submitted].concat(qCols);
        });

        const csvLines = [headers].concat(rows).map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        );
        const csvContent = csvLines.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(exam.title || 'exam').replace(/[^a-z0-9_\-]+/gi, '_')}_responses.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }

  // Kick off initial render in case DOMContentLoaded already fired
  render();
})();
