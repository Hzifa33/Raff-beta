'use strict';

/**
 * Read-only local OPAC server.
 *
 * It never connects to an external host. By default it binds to 127.0.0.1;
 * LAN exposure is explicit. Only public bibliographic, holding and item status
 * data are returned. Patron, circulation notes, users and audit data are never
 * exposed by this server.
 */
const http = require('http');
const os = require('os');
const { URL } = require('url');

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function text(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  });
  res.end(body);
}

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/ـ/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLocaleLowerCase('ar').replace(/\s+/g, ' ').trim();
}

function shellHtml() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فهرس رَفّ المحلي</title><link rel="stylesheet" href="/style.css"></head><body><header><div class="brand"><span class="mark">ر</span><div><b>فهرس رَفّ المحلي</b><small>بحث في مقتنيات المكتبة — قراءة فقط</small></div></div><span class="offline">محلي بلا إنترنت</span></header><main><section class="hero"><p>ابحث بالعنوان أو المؤلف أو الموضوع أو الرقم المرجعي</p><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="q" autofocus placeholder="مثال: تاريخ الأندلس"><button id="clear" aria-label="مسح">×</button></label><div class="filters"><label><input id="available" type="checkbox"> المتاح فقط</label><select id="branch"><option value="">كل الفروع</option></select></div></section><section class="summary" id="summary">ابدأ الكتابة لعرض النتائج</section><section class="results" id="results"></section></main><dialog id="details"><button class="close" id="close">×</button><div id="detailsBody"></div></dialog><footer>رَفّ — بيانات المكتبة تبقى داخل شبكتها المحلية</footer><script src="/app.js"></script></body></html>`;
}

function stylesheet() {
  return `@font-face{font-family:Cairo;src:local('Cairo')}*{box-sizing:border-box}body{margin:0;background:#f6f1e8;color:#2f2218;font-family:Cairo,Tahoma,Arial,sans-serif}header{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 max(20px,5vw);background:#2d2018;color:#fff;box-shadow:0 8px 30px #2d201829}.brand{display:flex;align-items:center;gap:11px}.mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#b98a4b;color:#fff;font-size:22px;font-weight:900}.brand div{display:flex;flex-direction:column}.brand small{color:#dac8b3;font-size:11px}.offline{font-size:11px;padding:6px 10px;border:1px solid #ffffff30;border-radius:999px}main{width:min(1040px,calc(100% - 28px));margin:auto}.hero{padding:46px 0 22px;text-align:center}.hero p{font-size:18px;font-weight:700}.search{display:flex;align-items:center;max-width:720px;margin:14px auto 10px;background:#fff;border:1px solid #dfd3c3;border-radius:16px;padding:4px 12px;box-shadow:0 12px 36px #5c3d1d14}.search:focus-within{border-color:#a57436;box-shadow:0 0 0 4px #b98a4b22}.search svg{width:20px;fill:none;stroke:#8c693f;stroke-width:2}.search input{flex:1;border:0;outline:0;background:transparent;padding:13px;font:inherit}.search button{border:0;background:transparent;font-size:24px;color:#8c7864;cursor:pointer}.filters{display:flex;justify-content:center;gap:12px;align-items:center;font-size:12px}.filters select{padding:7px 10px;border:1px solid #dfd3c3;border-radius:9px;background:#fff;color:inherit}.summary{font-size:12px;color:#7b6753;padding:8px 2px}.results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;padding-bottom:42px}.card{display:flex;flex-direction:column;gap:11px;min-height:230px;padding:15px;border:1px solid #e0d4c4;border-radius:15px;background:#fff;box-shadow:0 4px 18px #4930180c;cursor:pointer;text-align:right}.card:hover{transform:translateY(-2px);border-color:#b98a4b;box-shadow:0 12px 30px #49301818}.cover{height:74px;border-radius:11px;background:linear-gradient(135deg,#ede1cf,#d8bea0);display:grid;place-items:center;font-size:28px;font-weight:900;color:#6a4829;overflow:hidden}.cover img{width:100%;height:100%;object-fit:cover}.card h2{font-size:14px;margin:0;line-height:1.65}.card p{font-size:11px;color:#756352;margin:0}.meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:auto}.tag{font-size:9px;padding:4px 7px;border-radius:999px;background:#f2eadf}.tag.ok{background:#e6f2e8;color:#31663a}.tag.no{background:#f6e5e2;color:#8b3f35}.empty{grid-column:1/-1;text-align:center;padding:60px 15px;color:#756352}dialog{border:0;border-radius:18px;width:min(720px,calc(100% - 24px));max-height:85vh;padding:0;background:#fff;color:inherit;box-shadow:0 30px 90px #1c120b55}dialog::backdrop{background:#21160e88;backdrop-filter:blur(3px)}.close{position:absolute;left:12px;top:10px;border:0;background:#f2eadf;border-radius:9px;width:32px;height:32px;font-size:20px;cursor:pointer}.detail{padding:30px}.detail h1{font-size:24px;margin:0 0 4px}.detail .sub{color:#756352}.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:18px}.fact{padding:10px;border-radius:10px;background:#f8f4ed}.fact small{display:block;color:#88715a}.items{margin-top:18px;border:1px solid #e0d4c4;border-radius:12px;overflow:hidden}.item{display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #e0d4c4;font-size:11px}.item:last-child{border:0}footer{text-align:center;padding:22px;color:#87705a;font-size:10px}@media(max-width:850px){.results{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){header{padding:0 14px}.offline{display:none}.hero{padding-top:30px}.results{grid-template-columns:1fr}.facts{grid-template-columns:1fr}}`;
}

function appJs() {
  return `'use strict';const q=document.getElementById('q'),results=document.getElementById('results'),summary=document.getElementById('summary'),available=document.getElementById('available'),branch=document.getElementById('branch'),dialog=document.getElementById('details');let timer;function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}async function init(){const r=await fetch('/api/meta').then(x=>x.json());branch.innerHTML='<option value="">كل الفروع</option>'+r.branches.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');run()}async function run(){clearTimeout(timer);timer=setTimeout(async()=>{const u=new URL('/api/search',location.origin);u.searchParams.set('q',q.value);if(available.checked)u.searchParams.set('available','1');if(branch.value)u.searchParams.set('branch',branch.value);const data=await fetch(u).then(x=>x.json());summary.textContent=data.total?'تم العثور على '+data.total+' نتيجة':'لا توجد نتائج مطابقة';results.innerHTML=data.records.length?data.records.map(card).join(''):'<div class="empty">لا توجد كتب مطابقة. جرّب كلمة أقصر أو غيّر مرشح الإتاحة.</div>';},120)}function card(r){return '<button class="card" data-id="'+esc(r.id)+'"><div class="cover">'+(r.coverDataUrl?'<img src="'+esc(r.coverDataUrl)+'" alt="">':esc((r.title||'ر')[0]))+'</div><div><h2>'+esc(r.title)+'</h2><p>'+esc(r.author||'مؤلف غير محدد')+' · '+esc(r.publisher||'ناشر غير محدد')+'</p></div><div class="meta">'+(r.referenceNumber?'<span class="tag">'+esc(r.referenceNumber)+'</span>':'')+'<span class="tag '+(r.available?'ok':'no')+'">'+(r.available?'متاح: '+r.availableCount:'غير متاح')+'</span></div></button>'}results.addEventListener('click',async e=>{const b=e.target.closest('[data-id]');if(!b)return;const r=await fetch('/api/record/'+encodeURIComponent(b.dataset.id)).then(x=>x.json());document.getElementById('detailsBody').innerHTML='<div class="detail"><h1>'+esc(r.title)+'</h1><p class="sub">'+esc(r.author||'مؤلف غير محدد')+'</p>'+(r.summary?'<p>'+esc(r.summary)+'</p>':'')+'<div class="facts"><div class="fact"><small>الناشر</small><b>'+esc(r.publisher||'—')+'</b></div><div class="fact"><small>سنة النشر</small><b>'+esc(r.publishYear||'—')+'</b></div><div class="fact"><small>التصنيف</small><b>'+esc(r.category||'—')+'</b></div><div class="fact"><small>ISBN</small><b>'+esc(r.isbn13||r.isbn10||'—')+'</b></div></div><div class="items">'+r.items.map(i=>'<div class="item"><span>'+esc(i.branch)+' · '+esc(i.location)+'</span><b>'+esc(i.statusLabel)+'</b></div>').join('')+'</div></div>';dialog.showModal()});q.addEventListener('input',run);available.addEventListener('change',run);branch.addEventListener('change',run);document.getElementById('clear').onclick=()=>{q.value='';run();q.focus()};document.getElementById('close').onclick=()=>dialog.close();init();`;
}

class LocalOpacServer {
  constructor(snapshotProvider) {
    this.snapshotProvider = snapshotProvider;
    this.server = null;
    this.address = null;
    this.lan = false;
  }

  publicData() {
    const data = this.snapshotProvider();
    const branches = (data.branches || []).filter((x) => !x.deletedAt && x.active !== false).map((x) => ({ id: x.id, name: x.name, code: x.code }));
    return { data, branches };
  }

  search(query, filters = {}) {
    const { data } = this.publicData();
    const q = normalize(query);
    const holdings = (data.holdings || []).filter((x) => !x.deletedAt);
    const items = (data.items || []).filter((x) => !x.deletedAt && !x.archived);
    const records = (data.records || []).filter((r) => !r.deletedAt).filter((r) => {
      if (q) {
        const haystack = normalize([r.title, r.subtitle, r.author, r.publisher, r.category, r.referenceNumber, r.isbn13, r.isbn10, ...(r.subjects || [])].join(' '));
        if (!haystack.includes(q)) return false;
      }
      const recordItems = items.filter((i) => i.recordId === r.id);
      if (filters.available && !recordItems.some((i) => i.status === 'available')) return false;
      if (filters.branch) {
        const hids = new Set(holdings.filter((h) => h.recordId === r.id && h.branchId === filters.branch).map((h) => h.id));
        if (!recordItems.some((i) => hids.has(i.holdingId))) return false;
      }
      return true;
    }).slice(0, 200).map((r) => {
      const recordItems = items.filter((i) => i.recordId === r.id);
      const availableCount = recordItems.filter((i) => i.status === 'available').length;
      return { id: r.id, title: r.title, author: r.author, publisher: r.publisher, publishYear: r.publishYear, category: r.category, referenceNumber: r.referenceNumber, coverDataUrl: r.coverDataUrl || '', available: availableCount > 0, availableCount, totalItems: recordItems.length };
    });
    return { total: records.length, records };
  }

  record(recordId) {
    const { data } = this.publicData();
    const record = (data.records || []).find((x) => x.id === recordId && !x.deletedAt);
    if (!record) return null;
    const holdings = (data.holdings || []).filter((x) => x.recordId === record.id && !x.deletedAt);
    const items = (data.items || []).filter((x) => x.recordId === record.id && !x.deletedAt && !x.archived).map((i) => {
      const holding = holdings.find((h) => h.id === i.holdingId);
      const branch = (data.branches || []).find((b) => b.id === holding?.branchId);
      const labels = { available: 'متاح', on_loan: 'معار', reserved: 'محجوز', lost: 'مفقود', damaged: 'تالف', maintenance: 'صيانة', withdrawn: 'مسحوب', in_transit: 'قيد النقل' };
      return { branch: branch?.name || 'غير محدد', location: [holding?.room, holding?.section, holding?.shelf].filter(Boolean).join(' · ') || 'مكان غير محدد', status: i.status, statusLabel: labels[i.status] || i.status };
    });
    const safe = { id: record.id, title: record.title, subtitle: record.subtitle, author: record.author, publisher: record.publisher, publishYear: record.publishYear, edition: record.edition, category: record.category, summary: record.summary, subjects: record.subjects, isbn13: record.isbn13, isbn10: record.isbn10, referenceNumber: record.referenceNumber, coverDataUrl: record.coverDataUrl || '', items };
    return safe;
  }

  async start({ lan = false, port = 0 } = {}) {
    if (this.server) return this.status();
    this.lan = !!lan;
    const host = lan ? '0.0.0.0' : '127.0.0.1';
    this.server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (req.method !== 'GET') { json(res, 405, { error: 'read-only' }); return; }
        if (url.pathname === '/') { text(res, 200, shellHtml(), 'text/html'); return; }
        if (url.pathname === '/style.css') { text(res, 200, stylesheet(), 'text/css'); return; }
        if (url.pathname === '/app.js') { text(res, 200, appJs(), 'application/javascript'); return; }
        if (url.pathname === '/api/meta') { const { branches } = this.publicData(); json(res, 200, { branches, offline: true }); return; }
        if (url.pathname === '/api/search') { json(res, 200, this.search(url.searchParams.get('q') || '', { available: url.searchParams.get('available') === '1', branch: url.searchParams.get('branch') || '' })); return; }
        if (url.pathname.startsWith('/api/record/')) { const record = this.record(decodeURIComponent(url.pathname.slice('/api/record/'.length))); if (!record) { json(res, 404, { error: 'not-found' }); return; } json(res, 200, record); return; }
        json(res, 404, { error: 'not-found' });
      } catch (_) { json(res, 500, { error: 'internal' }); }
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(Number(port) || 0, host, resolve); });
    this.address = this.server.address();
    return this.status();
  }

  async stop() {
    if (!this.server) return { running: false };
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(resolve));
    this.address = null;
    return { running: false };
  }

  status() {
    if (!this.server || !this.address) return { running: false, url: '', lan: false };
    const port = this.address.port;
    let host = '127.0.0.1';
    if (this.lan) {
      const interfaces = os.networkInterfaces();
      outer: for (const rows of Object.values(interfaces)) for (const row of rows || []) if (row.family === 'IPv4' && !row.internal) { host = row.address; break outer; }
    }
    return { running: true, url: `http://${host}:${port}`, localUrl: `http://127.0.0.1:${port}`, lan: this.lan, port };
  }
}

module.exports = LocalOpacServer;
