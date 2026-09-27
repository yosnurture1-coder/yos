// ============================================================
//  영수증 정산 — 제출 화면(index.html)이 쓰는 코드
//  이 화면 하나를 여러 정산 담당자가 같이 써요. 각자 받은 링크 끝의 ?s=배포ID 로 그 담당자의 정산 시트(Apps Script)에 연결돼요.
//  링크는 스프레드시트 메뉴 '영수증 정산 → 제출 링크 만들기'에서 나와요. 아래 API는 비워 두면 돼요.
// ============================================================
const API = "";   // (혼자만 쓸 때만) ?s= 없이 열었을 때 쓸 웹 앱 주소(/exec)

const 링크값 = (() => { try { return new URLSearchParams(location.search).get("s"); } catch (e) { return null; } })();
const 링크배포 = 링크값 && /^[A-Za-z0-9_-]{20,120}$/.test(링크값.trim()) ? 링크값.trim() : "";
const 링크틀림 = 링크값 != null && !링크배포;   // ?s=가 있는데 모양이 틀림 → 다른 곳(API)으로 보내지 않고 멈춤
const API주소 = 링크배포 ? "https://script.google.com/macros/s/" + 링크배포 + "/exec"
  : 링크틀림 ? "" : (/^https?:\/\/\S+\/exec(\?\S*)?$/.test(API.trim()) ? API.trim() : "");
const API가dev = !링크값 && /\/dev(\?\S*)?$/.test(API.trim());
const 연결표 = 링크배포 ? 링크배포.slice(-12) : "";   // 폰에 저장하는 본인 정보·쓰던 영수증을 링크(담당자)마다 따로 둠
const 금액최소 = 100, 금액최대 = 5000000;

// ---------- 교회 양식의 계정과목 · 사역활동 ----------
const 계정 = [
  { 이름: "(사)식대", 짧게: "식대", 단가: 6000, 규칙: "1인 한도 6,000원" },
  { 이름: "(사)간식비", 짧게: "간식비", 단가: 4000, 규칙: "1인당 4,000원" },
  { 이름: "(사)기타-소모품", 짧게: "소모품", 묶음: "일반", 설명: "소모품류" },
  { 이름: "(사)일반문구비", 짧게: "문구비", 묶음: "일반", 설명: "문구류" },
  { 이름: "(사)도서인쇄비-인쇄비", 짧게: "인쇄비", 묶음: "도서인쇄비", 설명: "교재, 순서지, 주보 등 인쇄 비용", 증빙: "정산할 때 견적서와 견본 사진을 함께 내야 해요." },
  { 이름: "(사)도서인쇄비-기타도서인쇄비", 짧게: "기타도서인쇄비", 묶음: "도서인쇄비", 설명: "현수막, 배너 등 제작 비용", 증빙: "정산할 때 견적서와 견본 사진을 함께 내야 해요." },
  { 이름: "(사)도서인쇄비-도서구입비", 짧게: "도서구입비", 묶음: "도서인쇄비", 설명: "도서 구입", 증빙: "구입한 도서 목록과 도서 사진을 함께 내야 해요." },
  { 이름: "(사)임차료-차량", 짧게: "차량 임차료", 묶음: "임차료", 설명: "차량 대절" },
  { 이름: "(사)임차료-기타", 짧게: "기타 임차료", 묶음: "임차료", 설명: "시설, 숙소, 비품 등 대여비" },
  { 이름: "(사)여비교통비-자가운전보조금", 짧게: "자가운전보조금", 묶음: "여비교통비", 설명: "자가운전 보조", 증빙: "교통비 명세서와 증빙을 함께 내야 해요." },
  { 이름: "(사)여비교통비-주차료", 짧게: "주차료", 묶음: "여비교통비", 설명: "주차료" },
  { 이름: "(사)여비교통비-대중교통", 짧게: "대중교통", 묶음: "여비교통비", 설명: "버스, 기차, 택시 등" },
  { 이름: "(사)여비교통비-통행료", 짧게: "통행료", 묶음: "여비교통비", 설명: "통행료" },
  { 이름: "(사)선물비", 짧게: "선물비", 묶음: "일반", 설명: "상패, 꽃 등 선물 성격의 재화", 증빙: "상품권 지급은 지양해요. 상품권을 썼다면 받은 사람의 이름·전화번호·사인을 받아 함께 내야 해요. 팀 내 행사나 생일 선물은 살 수 없어요." },
  { 이름: "(사)지급수수료", 짧게: "지급수수료", 묶음: "일반", 설명: "각종 수수료, 티켓" },
];
const 계정표 = Object.fromEntries(계정.map(g => [g.이름, g]));
const 사역활동 = [
  { 이름: "리더훈련", 예: ["엘더모임", "전체리더모임", "운영위원회 회의"] },
  { 이름: "사역훈련", 예: ["사역국장 회의"] },
  { 이름: "부서별팀활동", 예: ["사역국 팀모임", "행사", "사역"] },
  { 이름: "일반세미나", 예: ["학교 세미나"] },
];

// ---------- 받을 금액 ----------
//  (사)식대 1인 한도 6,000원 · (사)간식비 1인당 4,000원 → 영수증 합계와 (단가 × 인원) 중 적은 쪽, 그 밖은 영수증 금액 그대로(실비)
//  한 사역에 영수증이 여러 장이고 한도를 넘으면 받을 금액을 영수증 순서대로 채워 나눔
//  아주 예외로 교회에서 1인 한도를 올려 준 사역은 올리는 사람이 그 한도를 적음(s.한도) — 담당자가 정산폼 '1인 한도' 칸에서 확인·수정
const 기본단가 = s => (계정표[s.계정] && 계정표[s.계정].단가) || 0;
const 한도값 = s => { const v = 정수(s.한도); return v >= 1000 && v <= 200000 ? v : 0; };
const 단가 = s => { const d = 기본단가(s); return d ? (한도값(s) || d) : 0; };
//  이미 낸 사역에 영수증을 이어 낼 때(s.이어)는 이미 낸 영수증과 합쳐 한도를 보고, 받을 금액은 이번에 더 받을 몫만
function 계산(s) {
  const 인원 = (s.명단 || []).length;
  const 금액들 = (s.영수증 || []).map(r => 정수(r.금액));
  const 합계 = 금액들.reduce((a, b) => a + b, 0);
  const 이미 = s.이어 || null, 이미합 = 이미 ? 정수(이미.합계) : 0, 이미받을 = 이미 ? 정수(이미.받을) : 0;
  const 단 = 단가(s), 전체 = 이미합 + 합계;
  let 한도 = null, 전체받을 = 전체, 인당 = null, 넘침 = 0;
  if (단) {
    한도 = 단 * 인원;
    전체받을 = Math.min(전체, 한도);
    넘침 = Math.max(0, 전체 - 한도);
    인당 = 인원 ? (전체 >= 한도 ? 단 : 전체 / 인원) : null;
  }
  const 받을 = Math.max(0, 전체받을 - 이미받을);
  let 남은 = 받을;
  const 나눔 = 금액들.map(a => { const x = Math.min(a, 남은); 남은 -= x; return x; });
  return { 인원, 합계, 단, 한도, 받을, 인당, 넘침, 나눔, 이미합, 이미받을, 전체, 전체받을 };
}

// ---------- 도구 ----------
const 요일 = "일월화수목금토";
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function 원(v) { return String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function 숫자만(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
function 정수(v) { const n = typeof v === "number" ? v : Number(숫자만(v)); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; }
function 날짜(v) { const p = String(v || "").split("-").map(Number); return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : null; }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function 오늘() { return ymd(new Date()); }
function 날글(v) { const d = 날짜(v); return d ? `${d.getMonth() + 1}월 ${d.getDate()}일 (${요일[d.getDay()]})` : ""; }
function 날짧게(v) { const d = 날짜(v); return d ? `${d.getMonth() + 1}월 ${d.getDate()}일` : ""; }
function 월숫자(v) { return Number(String(v || "").slice(5, 7)); }
function 월글(ym) { return `${Number(String(ym).slice(0, 4))}년 ${월숫자(ym)}월`; }
function 기본월() { const d = new Date(); if (d.getDate() <= 10) d.setDate(0); return ymd(d).slice(0, 7); }   // 달 초에는 지난달 정산
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5); }
function 새제출id() { const a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, "0")).join(""); }
function 이름키(v) { let s = String(v || ""); try { s = s.normalize("NFC"); } catch (e) {} return s.replace(/\s+/g, "").toLowerCase(); }
function 받침(n) { return [0, 1, 3, 6, 7, 8].indexOf(Number(String(n).slice(-1))) >= 0; }
function 과와(n) { return 받침(n) ? "과" : "와"; }
function 이가(n) { return 받침(n) ? "이" : "가"; }
function 동작() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }
function 칸(id, html, 꼭) { const el = document.getElementById(id); if (el && (꼭 || el._h !== html)) { el.innerHTML = html; el._h = html; } return el; }
function 저장읽기(키, 세션) { try { return JSON.parse((세션 ? sessionStorage : localStorage).getItem(키) || "null"); } catch (e) { return null; } }
function 저장쓰기(키, 값, 세션) { try { const st = 세션 ? sessionStorage : localStorage; 값 == null ? st.removeItem(키) : st.setItem(키, JSON.stringify(값)); } catch (e) {} }

// 여러 이름을 한 번에 — 쉼표 · 줄바꿈 · 가운뎃점 · 빗금으로 나누고, "김하늘 이은혜"처럼 한글 이름만 띄어 쓴 것도 나눔
function 이름나누기(글) {
  const 결과 = [];
  String(글 || "").replace(/\r/g, "").split(/[,\n\t·ㆍ\/;、，]+/).forEach(조각 => {
    const c = 조각.replace(/^\s*(\d+\s*[.)]|[-•*▪◦])\s*/, "").trim();
    if (!c) return;
    const 토막 = c.split(/\s+/);
    if (토막.length > 1 && 토막.every(x => /^[가-힣]{2,4}$/.test(x))) 결과.push(...토막);
    else 결과.push(c.replace(/\s+/g, " "));
  });
  return 결과.filter(x => x.length <= 30);
}

// ---------- 사진 ----------
async function 비트맵(blob) {
  if (window.createImageBitmap) { try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch (e) {} }
  return await new Promise((ok, no) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { setTimeout(() => URL.revokeObjectURL(u), 1000); ok(im); };
    im.onerror = () => { URL.revokeObjectURL(u); no(new Error("decode")); };
    im.src = u;
  });
}
// 긴 변을 줄인 JPEG 캔버스 (아주 긴 캡처는 조금 더 크게)
async function 줄인그림(blob, 긴변, 긴캡처) {
  const bmp = await 비트맵(blob);
  const W = bmp.naturalWidth || bmp.width, H = bmp.naturalHeight || bmp.height;
  if (!W || !H) throw new Error("size");
  const 한계 = 긴캡처 && Math.max(W, H) / Math.min(W, H) > 2.2 ? 긴캡처 : 긴변;
  const k = Math.min(1, 한계 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return { cv, w, h };
}
function 캔버스블롭(cv, 품질) { return new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error("encode")), "image/jpeg", 품질)); }
function 블롭글(blob) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => no(r.error); r.readAsDataURL(blob); }); }

// ---------- 서버 ----------
async function 보내기(내용, 초) {
  if (!API주소) throw Object.assign(new Error("설정"), { 코드: "설정" });
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), (초 || 30) * 1000);
  try {
    // 머리글을 따로 붙이지 않음 → text/plain으로 가서 사전 요청(CORS) 없이 바로 전달
    const r = await fetch(API주소, { method: "POST", body: JSON.stringify(내용), signal: ctl.signal, redirect: "follow" });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { 코드: "연결" });
    return await r.json();
  } catch (e) {
    if (e && e.코드) throw e;
    throw Object.assign(new Error(e && e.name === "AbortError" ? "시간" : "연결"), { 코드: e && e.name === "AbortError" ? "시간" : "연결" });
  } finally { clearTimeout(t); }
}
async function 설정받기() {
  if (!API주소) return null;
  try { const r = await fetch(API주소, { redirect: "follow" }); const d = await r.json(); return d && d.ok ? d : null; } catch (e) { return null; }
}
function 설정알림() {
  if (API주소) return "";
  if (링크틀림) return `<p class="setup">링크 주소가 잘렸거나 잘못됐어요. 정산 담당자에게 받은 링크를 처음부터 다시 열어 주세요.</p>`;
  if (API가dev) return `<p class="setup">관리자 안내: API에 /dev로 끝나는 주소가 들어 있어요. 배포할 때 받은 /exec 주소로 바꿔 주세요.</p>`;
  return `<p class="setup">정산 담당자에게 받은 링크로 열어 주세요. 영수증이 그 담당자에게 가도록 링크 끝에 담당자 표시(?s=…)가 붙어 있어요.</p>`;
}
function 연결글(e, 기본) {
  const c = e && e.코드;
  if (c === "시간") return "응답이 늦어요. 인터넷 연결을 확인하고 다시 해 주세요.";
  if (c === "연결") return "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.";
  if (c === "설정") return "정산 담당자에게 받은 링크로 열어 주세요.";
  return 기본 || "문제가 생겼어요. 다시 해 주세요.";
}

// ---------- 알림 (화면 아래 잠깐) ----------
let 알림타이머 = 0;
function 알림(글, 버튼) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = `<span>${esc(글)}</span>${버튼 ? `<button type="button" data-act="${esc(버튼.act)}">${esc(버튼.글)}</button>` : ""}`;
  el.classList.add("on");
  clearTimeout(알림타이머);
  알림타이머 = setTimeout(() => el.classList.remove("on"), 버튼 ? 6000 : 3400);
}

const 아이콘 = {
  느낌표: (n = 16) => `<svg width="${n}" height="${n}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><path d="M10 6.3v4.6M10 13.7v.1"/></svg>`,
  체크: (n = 16) => `<svg width="${n}" height="${n}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>`,
  엑스: (n = 16) => `<svg width="${n}" height="${n}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>`,
  정보: (n = 16) => `<svg width="${n}" height="${n}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><path d="M10 9v4.6M10 6.3v.1"/></svg>`,
  카메라: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5h3.2l1.6-2.5h6.4l1.6 2.5H20v10H4z"/><circle cx="12" cy="13.2" r="3.1"/></svg>`,
  더하기: `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`,
  받기: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12"/></svg>`,
  말풍선: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5c-4.2 0-7.5 2.7-7.5 6 0 2 1.2 3.8 3.1 4.9l-.6 2.6 3-1.7c.6.1 1.3.2 2 .2 4.2 0 7.5-2.7 7.5-6s-3.3-6-7.5-6z"/></svg>`,
  새로: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 7.5A6 6 0 1 0 16 12"/><path d="M16 3.5v4h-4"/></svg>`,
  꺾쇠: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>`,
};
