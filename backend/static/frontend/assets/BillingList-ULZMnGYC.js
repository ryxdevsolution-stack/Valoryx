const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/webPrintService-B_39K3xs.js","assets/vendor-BojPTacb.js"])))=>i.map(i=>d[i]);
import{t as q,u as De,b as Y,j as e,e as re,R as ge,a as de,X as Ae,_ as ue,C as ze,B as Be}from"./index-BsXlWx5f.js";import{u as Ee,d as Fe,r as p,L as Le}from"./vendor-BojPTacb.js";import{D as Me,B as Re}from"./DashboardLayout-Bwlw4l9x.js";import{C as Ie,T as Ue}from"./SkeletonLoader-DWd4gtAc.js";import{g as Qe}from"./shopSettingsService-Davdum5o.js";import{R as He}from"./rotate-ccw-CQfnPk8f.js";import{C as Ge}from"./calendar-DBdQe-c9.js";import{F as he}from"./file-text-z4YGOXNg.js";import{U as We}from"./user-CY7AoUci.js";import{C as Oe}from"./clock-BXZN5rG6.js";import{W as ye}from"./wallet-DUKVCkbQ.js";import{P as Ye}from"./trending-up-_oG7M_pK.js";import{S as qe}from"./smartphone-Bo3Uy4eB.js";import{D as Ve}from"./dollar-sign-DaCBcWxE.js";import"./search-CiqXqhVw.js";import"./store-iLhcGdSt.js";import"./truck-C2U3OrwQ.js";import"./chevron-right-D7FBO0TM.js";import"./zap-BiOePPBZ.js";function T(n){return"₹"+n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}function Ke(n){const c=new Date(n),l=c.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),b=c.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0});return`${l} | ${b}`}function Je(n){try{const c=JSON.parse(n);if(Array.isArray(c))return c.map(l=>l.payment_name||l.payment_type||"Cash").join(" + ")}catch{}return n||"Cash"}function Xe(n){return!n||n.length<4?n:"••••••"+n.slice(-4)}function y(n){return n?n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}async function Ze(n){try{const c=await fetch(n,{mode:"cors"});if(!c.ok)return null;const l=await c.blob();return await new Promise((b,k)=>{const _=new FileReader;_.onloadend=()=>b(_.result),_.onerror=k,_.readAsDataURL(l)})}catch{return null}}async function et(n,c){const l=n.type==="gst",b=l?n.final_amount:n.total_amount,k=n.payment_status==="pending",_=Je(n.payment_type);let R=null;c.logo_url&&(R=await Ze(c.logo_url));const se=y(c.client_name.charAt(0).toUpperCase()),V=R?`<img src="${R}" alt="Logo" class="logo-img" />`:`<div class="logo-letter">${se}</div>`,I=[c.address,c.address2].filter(Boolean).map(y).join(", "),P=[],C=[];c.gstin&&P.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${y(c.gstin)}</span></div>`),C.push(`<div class="biz-row"><span class="biz-lbl">Legal Name</span><span class="biz-val">${y(c.client_name)}</span></div>`),c.phone&&P.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${y(c.phone)}</span></div>`),c.email&&C.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${y(c.email)}</span></div>`),n.customer_gstin&&P.push(`<div class="biz-row"><span class="biz-lbl">Cust. GSTIN</span><span class="biz-val">${y(n.customer_gstin)}</span></div>`),C.push(`<div class="biz-row"><span class="biz-lbl">Bill Type</span><span class="biz-val">${l?"GST Invoice":"Invoice"}</span></div>`);const U=`
    <div class="biz-grid">
      <div class="biz-col">${P.join("")}</div>
      <div class="biz-col">${C.join("")}</div>
    </div>`,K=n.customer_name&&n.customer_name!=="Walk-in Customer"?y(n.customer_name.split(" ")[0]):null,J=K?`Hi ${K}, here's your bill!`:"Here's your bill!",i=n.customer_phone?Xe(n.customer_phone):null,z=l?'<th class="tc gst-th">GST %</th>':"",j=n.items.map((v,Q)=>{const H=l?`<td class="tc muted">${v.gst_percentage}%</td>`:"";return`
      <tr class="${Q%2===0?"":"row-alt"}">
        <td class="item-td">
          <span class="item-name">${y(v.product_name)}</span>
          ${v.item_code?`<span class="item-code">${y(v.item_code)}</span>`:""}
        </td>
        <td class="tc">${v.quantity}</td>
        <td class="tr">${T(v.rate)}</td>
        ${H}
        <td class="tr fw">${T(v.amount)}</td>
      </tr>`}).join(""),D=n.discount_amount||0,f=n.negotiable_amount||0,N=[];if(N.push(`<tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${T(n.subtotal||b)}</td></tr>`),D>0){const v=n.discount_percentage?`Discount (${n.discount_percentage}%)`:"Discount";N.push(`<tr><td class="tot-lbl">${v}</td><td class="tot-val green">− ${T(D)}</td></tr>`)}else f>0&&N.push(`<tr><td class="tot-lbl">Negotiated</td><td class="tot-val green">− ${T(f)}</td></tr>`);l&&(N.push(`<tr><td class="tot-lbl">CGST</td><td class="tot-val">${T(n.cgst)}</td></tr>`),N.push(`<tr><td class="tot-lbl">SGST</td><td class="tot-val">${T(n.sgst)}</td></tr>`));const w=c.receipt_footer?`<p class="footer-note">${y(c.receipt_footer)}</p>`:"",B=n.points_earned&&n.points_earned>0?`<div class="points-panel">
           <div class="confetti-bg">
             <div class="points-inner">
               <div class="points-label">You have earned</div>
               <div class="points-value">${n.points_earned.toFixed(2)} Points</div>
               <div class="points-sub">T&amp;C applied</div>
             </div>
           </div>
         </div>`:"",E=k?'<div class="pending-banner">⏳ &nbsp;PAYMENT PENDING — NOT YET COLLECTED</div>':"",F=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${n.bill_number} — ${y(c.client_name)}</title>
<style>
/* ── Reset ─────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
:root{--brand:#6B0000;--brand-light:#fff5f5}   /* dark maroon; override per client if needed */

/* ── Page ──────────────────────────────────────────── */
body{
  font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
  background:#ebebeb;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:28px 16px 40px;
  color:#1a1a1a;
}

/* ── Card ──────────────────────────────────────────── */
.card{
  background:#fff;
  width:100%;
  max-width:500px;
  border-radius:16px 16px 0 0;   /* bottom rounded by SVG wave */
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.13);
}

/* ── Header (white bg, logo left, location right) ──── */
.hdr{
  background:#fff;
  padding:20px 22px 16px;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
}
.logo-circle{
  width:56px;height:56px;
  border-radius:50%;
  border:2.5px solid var(--brand);
  overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  background:var(--brand-light);
  flex-shrink:0;
}
.logo-img{width:100%;height:100%;object-fit:cover;display:block}
.logo-letter{font-size:22px;font-weight:800;color:var(--brand)}
.location-block{text-align:right;flex:1}
.location-line{font-size:12px;color:#555;display:flex;align-items:center;justify-content:flex-end;gap:4px}
.location-pin{font-size:13px}
.view-store{font-size:11px;font-weight:700;color:var(--brand);text-decoration:underline;margin-top:3px;cursor:pointer;display:block;text-align:right}

/* ── Brand bar ─────────────────────────────────────── */
.brand-bar{height:4px;background:var(--brand)}

/* ── Pending banner ────────────────────────────────── */
.pending-banner{
  background:#fef3c7;border-bottom:2px solid #f59e0b;
  color:#92400e;text-align:center;padding:9px;
  font-size:11.5px;font-weight:700;letter-spacing:1.2px;
}

/* ── Business info 2-col grid ──────────────────────── */
.biz-section{padding:14px 22px}
.biz-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.biz-col{}
.biz-row{margin-bottom:5px}
.biz-lbl{display:block;font-size:10px;color:#999;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
.biz-val{display:block;font-size:12px;color:#1a1a1a;font-weight:600;margin-top:1px}

/* ── Dashed separator ──────────────────────────────── */
.dash{
  border:none;
  border-top:1.5px dashed #d8d8d8;
  margin:0 22px;
}

/* ── Greeting ──────────────────────────────────────── */
.greeting-row{
  padding:12px 22px;
  display:flex;align-items:center;justify-content:space-between;
}
.greeting-text{font-size:13.5px;font-weight:600;color:#1a1a1a}
.dl-icon{font-size:16px;color:var(--brand)}

/* ── Amount hero row ───────────────────────────────── */
.amount-hero{padding:14px 22px}
.amount-row-top{display:flex;align-items:flex-start;justify-content:space-between}
.amount-main{font-size:26px;font-weight:900;color:#1a1a1a;letter-spacing:-0.5px}
.amount-payment{font-size:13px;color:#666;margin-top:2px;font-weight:500}
.status-chip{
  display:inline-block;font-size:9px;font-weight:800;letter-spacing:1.5px;
  padding:3px 10px;border-radius:20px;text-transform:uppercase;margin-left:6px;
  vertical-align:middle;
}
.chip-paid{background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7}
.chip-pending{background:#fef3c7;color:#92400e;border:1.5px solid #fcd34d}

.amount-meta{text-align:right}
.meta-date{font-size:11.5px;color:#555;font-weight:500}
.meta-items{font-size:11px;color:#999;margin-top:2px}

/* ── Bill # + phone row ────────────────────────────── */
.bill-meta-row{
  padding:0 22px 14px;
  display:flex;justify-content:space-between;align-items:center;
}
.meta-pill{
  font-size:11px;color:#666;
  background:#f5f5f5;border-radius:6px;padding:3px 10px;
}
.meta-pill strong{color:#1a1a1a;font-weight:700}
.cashier-note{font-size:10.5px;color:#aaa}

/* ── Items table ───────────────────────────────────── */
.items-section{padding:0 22px 0}
.items-label{
  font-size:9.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:1.5px;color:#aaa;
  margin-bottom:8px;
}
.items-tbl{border-collapse:collapse;width:100%}
.items-tbl th{
  font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.5px;color:#999;
  padding:6px 4px 8px;
  border-bottom:1px dashed #ddd;
}
.items-tbl td{
  padding:9px 4px;font-size:12.5px;color:#1a1a1a;
  border-bottom:1px dashed #f0f0f0;
}
.row-alt td{background:#fdfdfd}
.item-td{max-width:180px}
.item-name{display:block;font-weight:700;color:#111}
.item-code{display:block;font-size:9.5px;color:#ccc;margin-top:1px}
.gst-th{color:#bbb}
.muted{color:#bbb;font-size:11.5px}
.tc{text-align:center}
.tr{text-align:right}
.fw{font-weight:700}

/* ── Totals ────────────────────────────────────────── */
.totals-section{padding:12px 22px 14px}
.tot-tbl{border-collapse:collapse;width:100%}
.tot-lbl{font-size:12px;color:#777;padding:5px 0}
.tot-val{font-size:12px;color:#333;text-align:right;padding:5px 0;font-weight:500}
.green{color:#059669}
.grand-row td{padding-top:10px !important;border-top:2px solid #1a1a1a !important}
.grand-lbl{font-size:15px;font-weight:900;color:#1a1a1a}
.grand-val{font-size:22px;font-weight:900;color:var(--brand);text-align:right}

/* ── Footer inside card ────────────────────────────── */
.card-footer{padding:14px 22px 0;text-align:center}
.footer-note{font-size:11px;color:#888;margin-bottom:6px;line-height:1.6}

/* ── Wavy bottom SVG ───────────────────────────────── */
.wave-wrap{display:block;line-height:0;margin-top:12px}
.wave-wrap svg{display:block;width:100%}

/* ── Loyalty points panel (below card) ─────────────── */
.points-panel{
  width:100%;max-width:500px;
  border-radius:0 0 16px 16px;
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.13);
  margin-top:-1px;
}
.confetti-bg{
  background:linear-gradient(135deg,#fff9e6 0%,#fff3cc 40%,#fff9e6 100%);
  padding:18px 22px;
  text-align:center;
  position:relative;
  border-top:1px solid #ffe082;
}
.confetti-bg::before{
  content:'🎉 🎊 🎁 🎉 🎊';
  position:absolute;top:6px;left:0;right:0;
  font-size:11px;letter-spacing:8px;opacity:.4;
  text-align:center;
}
.points-inner{position:relative;z-index:1}
.points-label{font-size:12px;color:#a16207;font-weight:500;margin-bottom:2px}
.points-value{font-size:22px;font-weight:900;color:#92400e;letter-spacing:-0.5px}
.points-sub{font-size:10px;color:#b45309;margin-top:4px}

/* ── Actions (hidden on print) ─────────────────────── */
.actions{
  width:100%;max-width:500px;
  display:flex;gap:12px;justify-content:center;
  padding:18px 0 0;
}
.btn{
  padding:11px 32px;border-radius:10px;
  font-size:13px;font-weight:700;
  cursor:pointer;border:none;
  transition:all .15s ease;letter-spacing:.3px;
}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.15)}
.btn-primary{background:var(--brand);color:#fff}
.btn-secondary{background:#fff;color:#555;border:1.5px solid #ddd}

/* ── Powered by ─────────────────────────────────────── */
.powered-row{
  width:100%;max-width:500px;
  text-align:center;padding:12px 0 4px;
  font-size:10px;color:#bbb;
}
.powered-row strong{color:#555}

/* ── Print ──────────────────────────────────────────── */
@media print{
  body{background:#fff;padding:0}
  .card{box-shadow:none;border-radius:0;max-width:100%}
  .points-panel,.powered-row,.actions{max-width:100%}
  .actions{display:none}
}
</style>
</head>
<body>

<!-- ═══ CARD ════════════════════════════════════════════ -->
<div class="card">

  <!-- Header: logo + location -->
  <div class="hdr">
    <div class="logo-circle">${V}</div>
    <div class="location-block">
      <div class="location-line">
        <span class="location-pin">📍</span>
        <span>${I}</span>
      </div>
      <span class="view-store">${y(c.client_name)}</span>
    </div>
  </div>

  <!-- Brand accent bar -->
  <div class="brand-bar"></div>

  ${E}

  <!-- Business info 2-col -->
  <div class="biz-section">${U}</div>

  <hr class="dash"/>

  <!-- Greeting -->
  <div class="greeting-row">
    <span class="greeting-text">${J}</span>
    <span class="dl-icon">⬇</span>
  </div>

  <hr class="dash"/>

  <!-- Amount hero -->
  <div class="amount-hero">
    <div class="amount-row-top">
      <div>
        <div class="amount-main">
          ${T(b)}
          <span class="${k?"status-chip chip-pending":"status-chip chip-paid"}">${k?"Pending":"Paid"}</span>
        </div>
        <div class="amount-payment">${y(_)}</div>
      </div>
      <div class="amount-meta">
        <div class="meta-date">${Ke(n.created_at)}</div>
        <div class="meta-items">${n.items.length} item${n.items.length!==1?"s":""}</div>
      </div>
    </div>
  </div>

  <!-- Bill # + masked phone row -->
  <div class="bill-meta-row">
    <span class="meta-pill">Bill <strong>#${n.bill_number}</strong></span>
    ${i?`<span class="meta-pill">Mobile <strong>${y(i)}</strong></span>`:`<span class="cashier-note">Cashier: ${y(n.user_name||"Admin")}</span>`}
  </div>

  <hr class="dash"/>

  <!-- Items -->
  <div class="items-section">
    <div class="items-label">Items</div>
    <table class="items-tbl">
      <thead>
        <tr>
          <th style="text-align:left">Item</th>
          <th class="tc">Qty</th>
          <th class="tr">Rate</th>
          ${z}
          <th class="tr">Amt</th>
        </tr>
      </thead>
      <tbody>${j}</tbody>
    </table>
  </div>

  <hr class="dash" style="margin-top:8px"/>

  <!-- Totals -->
  <div class="totals-section">
    <table class="tot-tbl">
      ${N.join("")}
      <tr class="grand-row">
        <td class="grand-lbl">Grand Total</td>
        <td class="grand-val">${T(b)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer note -->
  ${w?`<div class="card-footer">${w}</div>`:""}

  <!-- Wavy bottom SVG — colour matches page background (#ebebeb) -->
  <div class="wave-wrap">
    <svg viewBox="0 0 500 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 Q12.5,28 25,0 Q37.5,28 50,0 Q62.5,28 75,0 Q87.5,28 100,0 Q112.5,28 125,0 Q137.5,28 150,0 Q162.5,28 175,0 Q187.5,28 200,0 Q212.5,28 225,0 Q237.5,28 250,0 Q262.5,28 275,0 Q287.5,28 300,0 Q312.5,28 325,0 Q337.5,28 350,0 Q362.5,28 375,0 Q387.5,28 400,0 Q412.5,28 425,0 Q437.5,28 450,0 Q462.5,28 475,0 Q487.5,28 500,0 L500,28 L0,28 Z" fill="#ebebeb"/>
    </svg>
  </div>

</div>
<!-- ═══ END CARD ═════════════════════════════════════════ -->

<!-- Loyalty points panel (festive, below card) -->
${B}

<!-- Powered by -->
<div class="powered-row">Powered by <strong>Valoryx</strong></div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn btn-secondary" onclick="window.close()">Close</button>
  <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
</div>

</body>
</html>`,x=new Blob([F],{type:"text/html;charset=utf-8"}),X=URL.createObjectURL(x);window.open(X,"_blank","width=580,height=900,scrollbars=yes")||q.error("Popup blocked — please allow popups for this site to generate PDFs."),setTimeout(()=>URL.revokeObjectURL(X),3e4)}function wt(){var xe;const n=Ee(),c=Fe(),{client:l}=De(),[b,k]=p.useState([]),[_,R]=p.useState([]),[se,V]=p.useState(!0),[h,I]=p.useState("all"),[P,C]=p.useState(1),U=17,[K,J]=p.useState(!1),[i,z]=p.useState(null),[j,D]=p.useState("all"),[f,N]=p.useState(""),[w,B]=p.useState(""),[E,F]=p.useState(null),[x,X]=p.useState(null),L=p.useRef(null),v=p.useRef(!0);p.useEffect(()=>{Z(),Qe().then(X).catch(()=>{})},[]),p.useEffect(()=>{if(v.current){v.current=!1;return}L.current=null,Z()},[c.key]),p.useEffect(()=>{const t=c.state;t!=null&&t.refreshAfterExchange&&(n(c.pathname,{replace:!0,state:{}}),L.current=null,Z())},[c.state]);const Q=p.useMemo(()=>{const t=new Map;return b.forEach(a=>{if(!a.payment_type){t.set(a.bill_id,[]);return}const r=String(a.payment_type).trim();if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)){t.set(a.bill_id,[]);return}if(r.startsWith("["))try{const s=JSON.parse(r);if(Array.isArray(s)){t.set(a.bill_id,s.map(o=>o.PAYMENT_TYPE||o.payment_type||o.payment_name).filter(Boolean));return}}catch{}t.set(a.bill_id,[r])}),t},[b]),H=t=>Q.get(t.bill_id)??[],Z=async()=>{L.current=null;const t=(async()=>{try{V(!0);const r=(await Y.get("/billing/list?limit=100&status=final")).data.bills||[];if(k(r),r.length>0){const s=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,o=new Set;r.forEach(u=>{if(!u.payment_type)return;const m=String(u.payment_type).trim();if(!s.test(m)){if(m.startsWith("["))try{const A=JSON.parse(m);if(Array.isArray(A)){A.forEach(S=>{const O=S.PAYMENT_TYPE||S.payment_type||S.payment_name;O&&o.add(O)});return}}catch{}o.add(m)}});const d=["CASH","UPI","CARD","CREDIT CARD","NET BANKING","CHEQUE","CREDIT","WALLET"],g=Array.from(o).sort((u,m)=>{const A=d.indexOf(u.toUpperCase()),S=d.indexOf(m.toUpperCase());return A!==-1&&S!==-1?A-S:A!==-1?-1:S!==-1?1:u.localeCompare(m)});R(g.map(u=>({payment_type_id:u,payment_name:u})))}}catch(a){console.error("Failed to fetch data:",a)}finally{V(!1),L.current=null}})();return L.current=t,t},G=t=>t.status==="cancelled"?0:t.type==="gst"?parseFloat(String(t.final_amount||"0")):parseFloat(String(t.total_amount||"0")),be=(t,a)=>{const r=G(t);if(typeof t.payment_type=="string"&&t.payment_type.trim().startsWith("["))try{const s=JSON.parse(t.payment_type);if(Array.isArray(s)){const o=s.find(d=>(d.PAYMENT_TYPE||d.payment_type)===a);if(o)return parseFloat(String(o.AMOUNT||o.amount||0))}}catch{return t.payment_type===a?r:0}return t.payment_type===a?r:0},fe=t=>{const a=[];let r=0;return t.forEach(s=>{const o=H(s);r++,o.length>1?o.forEach((d,g)=>{a.push({...s,displayPaymentType:d,displayAmount:be(s,d),isFirstPayment:g===0,paymentCount:o.length,billSequenceNumber:r})}):a.push({...s,displayPaymentType:o[0]||s.payment_type,displayAmount:G(s),isFirstPayment:!0,paymentCount:1,billSequenceNumber:r})}),a},ee=p.useCallback(t=>{const a=t.getFullYear(),r=String(t.getMonth()+1).padStart(2,"0"),s=String(t.getDate()).padStart(2,"0");return`${a}-${r}-${s}`},[]),te=p.useMemo(()=>ee(new Date),[ee]),$=p.useMemo(()=>b.filter(t=>{if(j==="all")return!0;const a=ee(new Date(t.created_at));return j==="today"?a===te:f&&w?a>=f&&a<=w:f?a>=f:w?a<=w:!0}),[b,j,f,w,te,ee]),ne=p.useMemo(()=>fe($),[$]),M=p.useMemo(()=>h==="all"?ne:ne.filter(t=>{const a=Q.get(t.bill_id)??[],r=a.length===1&&a[0].includes("+")?a[0].split("+"):a;return h.includes("+")?r.length<=1?!1:[...r].sort().join("+")===h:r.length===1&&t.displayPaymentType===h}),[ne,h,Q]),W=Math.ceil(M.length/U),oe=(P-1)*U,we=oe+U,ae=M.slice(oe,we),ve=p.useMemo(()=>$.reduce((t,a)=>t+G(a),0),[$]),ke=p.useMemo(()=>M.reduce((t,a)=>t+a.displayAmount,0),[M]),je=p.useMemo(()=>_.map(t=>{let a=0,r=0;return $.forEach(s=>{const o=H(s);o.length===1&&o[0]===t.payment_type_id&&(a+=1,r+=G(s))}),{...t,count:a,total:r}}),[_,$]),ce=p.useMemo(()=>{const t=new Map;return $.forEach(a=>{const r=H(a);if(r.length>1){const s=[...r].sort(),o=s.join("+"),d=t.get(o)||{count:0,total:0,types:s};d.count+=1,d.total+=G(a),t.set(o,d)}}),Array.from(t.entries()).map(([a,r])=>({id:a,name:a,count:r.count,total:r.total,types:r.types}))},[$]);p.useEffect(()=>{C(1)},[h,j,f,w]);const Ne=async t=>{try{J(!0);let a=b.find(g=>g.bill_id===t);if((!(a!=null&&a.items)||a.items.length===0)&&(a=(await Y.get(`/billing/${t}`)).data.bill),!a)throw new Error("Bill data not found");const r={bill_number:a.bill_number,customer_name:a.customer_name,customer_phone:a.customer_phone,items:a.items,subtotal:a.subtotal||a.total_amount||0,discount_percentage:a.discount_percentage,discount_amount:a.discount_amount,negotiable_amount:a.negotiable_amount||0,gst_amount:a.gst_amount||0,gst_percentage:a.gst_percentage||0,final_amount:a.final_amount||a.total_amount||0,total_amount:a.total_amount||a.subtotal||0,payment_type:a.payment_type,created_at:a.created_at,type:a.type,cgst:a.cgst||0,sgst:a.sgst||0,igst:a.igst||0,user_name:a.user_name||a.created_by_name||a.created_by||"Admin"},s=l?{client_name:l.client_name,address:l.address,phone:l.phone,email:l.email,gstin:l.gstin,logo_url:l.logo_url,upi_id:l.upi_id||"",receipt_footer:l.receipt_footer||""}:{client_name:"Business Name",address:"",phone:"",email:"",gstin:"",logo_url:"",upi_id:"",receipt_footer:""},o=typeof window<"u"?window.electronAPI:null;if(o&&typeof o.silentPrint=="function")try{const{generateReceiptHtml:g,generateUpiQrDataUrl:u}=await ue(async()=>{const{generateReceiptHtml:Se,generateUpiQrDataUrl:Te}=await import("./webPrintService-B_39K3xs.js");return{generateReceiptHtml:Se,generateUpiQrDataUrl:Te}},__vite__mapDeps([0,1])),m=r.type==="gst"?Number(r.final_amount):Number(r.total_amount),A=s.upi_id?await u(s.upi_id,s.client_name||"",m,r.bill_number):void 0,S=g(r,s,!0,A),O=await o.silentPrint(S,null);if(!O.success)throw new Error(O.error||"Print failed")}catch(g){console.error("Electron print failed:",g),q.error("Print failed: "+(g.message||"Unknown error"))}else{const{printBill:g}=await ue(async()=>{const{printBill:m}=await import("./webPrintService-B_39K3xs.js");return{printBill:m}},__vite__mapDeps([0,1])),u=await g(r,s,!0);if(!u.success)throw new Error(u.message||"Print failed")}}catch(a){console.error("Failed to print bill:",a),q.error(a.message||"Print failed. Please try again.")}finally{J(!1)}},pe=async t=>{z(t);try{const r=(await Y.get(`/billing/${t.bill_id}`)).data.bill;z(s=>s&&s.bill_id===t.bill_id?{...s,...r}:s),k(s=>s.map(o=>o.bill_id===t.bill_id?{...o,...r}:o))}catch(a){console.error("Failed to fetch fresh bill details:",a)}},_e=t=>{n(`/billing/exchange/${t}`)},Pe=async(t,a)=>{F({billId:t,billNumber:a})},$e=async()=>{var r,s;if(!E)return;const{billId:t,billNumber:a}=E;F(null);try{(await Y.post(`/billing/${t}/cancel`)).data.success&&k(d=>d.map(g=>g.bill_id===t?{...g,status:"cancelled"}:g))}catch(o){const d=((s=(r=o.response)==null?void 0:r.data)==null?void 0:s.error)||"Failed to cancel bill";d.includes("already cancelled")?k(g=>g.map(u=>u.bill_id===t?{...u,status:"cancelled"}:u)):q.error(d)}},ie=async(t,a)=>{var r,s;if(window.confirm(`Mark Bill #${a} as Paid?`))try{await Y.put(`/billing/${t}/mark-paid`),k(o=>o.map(d=>d.bill_id===t?{...d,payment_status:"paid"}:d)),(i==null?void 0:i.bill_id)===t&&z(o=>o&&{...o,payment_status:"paid"})}catch(o){q.error(((s=(r=o.response)==null?void 0:r.data)==null?void 0:s.error)||"Failed to mark as paid")}},le=async t=>{const a={client_name:(x==null?void 0:x.shop_name)||(l==null?void 0:l.client_name)||"Business",address:(x==null?void 0:x.address1)||(l==null?void 0:l.address)||"",address2:(x==null?void 0:x.address2)||"",phone:(x==null?void 0:x.phone)||(l==null?void 0:l.phone)||"",gstin:(x==null?void 0:x.gst_number)||(l==null?void 0:l.gstin)||"",logo_url:(l==null?void 0:l.logo_url)||"",receipt_footer:(x==null?void 0:x.receipt_footer)||""},r=t.type==="gst",s=r?t.final_amount??0:t.total_amount??0,o={bill_number:t.bill_number,customer_name:t.customer_name||"Walk-in Customer",customer_phone:t.customer_phone||"",items:(t.items||[]).map(d=>({product_id:"",product_name:d.product_name,item_code:d.item_code||"",hsn_code:"",unit:"pcs",quantity:d.quantity,rate:d.rate,mrp:d.mrp,gst_percentage:d.gst_percentage??0,gst_amount:d.quantity*d.rate*(d.gst_percentage??0)/100,amount:d.amount})),subtotal:t.subtotal??s,discount_percentage:t.discount_percentage??0,discount_amount:t.discount_amount??0,negotiable_amount:t.negotiable_amount,gst_amount:t.gst_amount??0,final_amount:t.final_amount??s,total_amount:t.total_amount??s,payment_type:t.payment_type||"[]",created_at:t.created_at,type:r?"gst":"non-gst",cgst:t.cgst??0,sgst:t.sgst??0,igst:t.igst??0,user_name:t.user_name||"",payment_status:t.payment_status||"paid"};await et(o,a)},Ce=t=>{const a=t.toUpperCase();return a.includes("CASH")?Re:a.includes("UPI")?qe:a.includes("CARD")?ze:a.includes("BANK")||a.includes("NET")?Be:a.includes("WALLET")?ye:a.includes("CHEQUE")||a.includes("CHECK")?he:Ve},me=t=>{const a=t.toUpperCase();return a.includes("CASH")?{bg:"from-green-500 to-green-600",text:"text-green-600",border:"border-green-500"}:a.includes("UPI")?{bg:"from-purple-500 to-purple-600",text:"text-purple-600",border:"border-purple-500"}:a.includes("CARD")?{bg:"from-blue-500 to-blue-600",text:"text-blue-600",border:"border-blue-500"}:a.includes("BANK")||a.includes("NET")?{bg:"from-indigo-500 to-indigo-600",text:"text-indigo-600",border:"border-indigo-500"}:a.includes("WALLET")?{bg:"from-orange-500 to-orange-600",text:"text-orange-600",border:"border-orange-500"}:a.includes("CHEQUE")||a.includes("CHECK")?{bg:"from-teal-500 to-teal-600",text:"text-teal-600",border:"border-teal-500"}:a.includes("PENDING")?{bg:"from-amber-500 to-amber-600",text:"text-amber-600",border:"border-amber-500"}:{bg:"from-gray-500 to-gray-600",text:"text-gray-600",border:"border-gray-500"}};return e.jsxs(Me,{children:[e.jsxs("div",{className:"flex flex-col h-[calc(100vh-6rem)]",children:[e.jsx("div",{className:"flex-shrink-0 mb-2",children:e.jsxs("div",{className:"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-lg font-bold text-gray-900 dark:text-white",children:"All Bills"}),e.jsx("p",{className:"text-[10px] text-gray-600 dark:text-gray-400",children:"Filter by date and payment method"})]}),e.jsxs(Le,{to:"/billing/restore",className:"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors",children:[e.jsx(He,{className:"w-3.5 h-3.5",strokeWidth:2}),"Restore Bills"]})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5",children:[e.jsx("button",{type:"button",onClick:()=>{D("all"),N(""),B("")},className:`px-2 py-1 text-[10px] font-medium rounded transition-all ${j==="all"?"bg-slate-700 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:"All"}),e.jsxs("button",{type:"button",onClick:()=>{D("today"),N(""),B("")},className:`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${j==="today"?"bg-blue-600 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:[e.jsx(Ge,{className:"w-3 h-3"}),"Today"]}),e.jsx("div",{className:"w-px h-5 bg-gray-300 dark:bg-gray-600"}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"From"}),e.jsx("input",{type:"date",value:f,max:w||te,onChange:t=>{N(t.target.value),D("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"To"}),e.jsx("input",{type:"date",value:w,min:f,max:te,onChange:t=>{B(t.target.value),D("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),j==="custom"&&(f||w)&&e.jsx("button",{type:"button",onClick:()=>{D("all"),N(""),B("")},className:"p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",title:"Clear dates",children:e.jsx(re,{className:"w-3.5 h-3.5"})})]})]})}),se?e.jsxs("div",{className:"space-y-4",children:[e.jsx(Ie,{count:4}),e.jsx(Ue,{rows:10})]}):b.length===0?e.jsx("div",{className:"flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow",children:e.jsxs("div",{className:"text-center",children:[e.jsx("p",{className:"text-gray-600 dark:text-gray-400 text-base",children:"No bills found"}),e.jsx("p",{className:"text-gray-500 dark:text-gray-500 text-sm mt-1",children:"Create your first bill to get started"})]})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide",children:e.jsxs("div",{className:"flex gap-1.5 pb-1 min-w-max",children:[e.jsxs("button",{type:"button",onClick:()=>{I("all"),Z()},className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${h==="all"?"bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-md":"bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${h==="all"?"bg-white/20":"bg-gray-100 dark:bg-gray-700"}`,children:e.jsx(he,{className:`w-3 h-3 ${h==="all"?"text-white":"text-gray-600 dark:text-gray-300"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium ${h==="all"?"text-white/80":"text-gray-500 dark:text-gray-400"}`,children:"All Bills"}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${h==="all"?"text-white":"text-gray-900 dark:text-white"}`,children:$.length}),e.jsxs("span",{className:`text-[10px] font-medium ${h==="all"?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:["₹",ve.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]}),je.map(t=>{const a=Ce(t.payment_name),r=me(t.payment_name),s=h===t.payment_type_id;return e.jsxs("button",{type:"button",onClick:()=>I(t.payment_type_id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${s?`bg-gradient-to-br ${r.bg} border-transparent shadow-md`:`bg-white dark:bg-gray-800 ${r.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-sm`}`,children:[e.jsx("div",{className:`p-1 rounded ${s?"bg-white/20":`bg-${r.text.split("-")[1]}-50 dark:bg-${r.text.split("-")[1]}-900/20`}`,children:e.jsx(a,{className:`w-3 h-3 ${s?"text-white":r.text}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${s?"text-white/80":`${r.text} opacity-70`}`,children:t.payment_name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${s?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${s?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:["₹",t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.payment_type_id)}),ce.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"w-px bg-gray-300 dark:bg-gray-600 mx-1 self-stretch"}),ce.map(t=>{const a=h===t.id;return e.jsxs("button",{type:"button",onClick:()=>I(t.id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${a?"bg-gradient-to-br from-amber-500 to-orange-500 border-transparent shadow-md":"bg-white dark:bg-gray-800 border-amber-400 border-opacity-40 dark:border-opacity-40 hover:border-opacity-70 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${a?"bg-white/20":"bg-amber-50 dark:bg-amber-900/20"}`,children:e.jsx(ge,{className:`w-3 h-3 ${a?"text-white":"text-amber-600"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${a?"text-white/80":"text-amber-600 opacity-70"}`,children:t.name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${a?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${a?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:["₹",t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.id)})]})]})}),e.jsx("div",{className:"hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md",children:e.jsxs("table",{className:"w-full",children:[e.jsx("thead",{className:"bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Bill #"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Date"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Customer"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Phone"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Payment Type"}),e.jsx("th",{className:"px-2 py-1.5 text-right text-[10px] font-bold text-white uppercase",children:"Amount"}),e.jsx("th",{className:"px-2 py-1.5 text-center text-[10px] font-bold text-white uppercase",children:"Actions"})]})}),e.jsx("tbody",{className:"divide-y divide-gray-200 dark:divide-gray-700",children:ae.map((t,a)=>{const r=t.displayPaymentType||"Unknown",s=me(r),o=t.paymentCount>1,d=t.isFirstPayment,u=new Set(M.slice(0,oe+a+1).map(m=>m.billSequenceNumber)).size;return e.jsxs("tr",{className:`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!t.isFirstPayment&&o?"border-t-0":""}`,onClick:()=>t.isFirstPayment&&pe(t),children:[e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsxs("div",{className:"flex items-center gap-1 flex-wrap",children:[e.jsx("span",{className:`text-xs font-semibold ${t.status==="cancelled"?"text-gray-400 line-through":"text-gray-700 dark:text-gray-300"}`,children:u}),t.status==="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase",children:"Cancelled"}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Pending"})]}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500 pl-2",children:"↳"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:new Date(t.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-700 dark:text-gray-300",children:t.customer_name}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:t.customer_phone}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:e.jsx("span",{className:`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gradient-to-r ${s.bg} rounded-full uppercase shadow-sm`,children:r})}),e.jsx("td",{className:"px-2 py-1.5 text-right whitespace-nowrap",children:e.jsxs("span",{className:"text-xs font-bold text-gray-900 dark:text-white",children:["₹",t.displayAmount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})}),d?e.jsx("td",{className:"px-2 py-1.5 text-center whitespace-nowrap",rowSpan:t.paymentCount,children:e.jsxs("div",{className:"flex items-center justify-center gap-1 flex-wrap",children:[t.payment_status==="pending"&&e.jsxs("button",{type:"button",onClick:m=>{m.stopPropagation(),ie(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-all border border-green-300 dark:border-green-700",title:"Mark as Paid",children:[e.jsx(de,{className:"w-3 h-3"}),"Mark Paid"]}),e.jsxs("button",{type:"button",onClick:m=>{m.stopPropagation(),_e(t.bill_id)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all",title:"Exchange Bill",children:[e.jsx(ge,{className:"w-3 h-3"}),"Exchange"]}),e.jsxs("button",{type:"button",onClick:m=>{m.stopPropagation(),Ne(t.bill_id)},disabled:K,className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed",title:"Print Bill",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"})}),"Print"]}),e.jsxs("button",{type:"button",onClick:m=>{m.stopPropagation(),le(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded transition-all",title:"Download PDF",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]}),e.jsxs("button",{type:"button",onClick:m=>{m.stopPropagation(),Pe(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all",title:"Cancel Bill",children:[e.jsx(re,{className:"w-3 h-3"}),"Cancel"]})]})}):null]},`${t.bill_id}-${t.displayPaymentType}-${a}`)})})]})}),e.jsx("div",{className:"md:hidden space-y-3",children:ae.filter(t=>t.isFirstPayment!==!1).map(t=>{var a;return e.jsxs("div",{onClick:()=>pe(t),className:"cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsxs("p",{className:"text-sm font-semibold text-gray-900 dark:text-white",children:["#",t.bill_number]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Payment Pending"})]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:t.customer_name||"Walk-in"})]}),e.jsx("span",{className:`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status==="cancelled"?"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400":"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`,children:t.displayPaymentType??t.payment_type})]}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-gray-400",children:[e.jsx("span",{children:t.created_at?new Date(t.created_at).toLocaleDateString():""}),e.jsxs("span",{className:"text-sm font-bold text-gray-900 dark:text-white",children:["₹",(a=t.displayAmount)==null?void 0:a.toLocaleString()]})]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsxs("div",{className:"mt-2 flex gap-2",children:[e.jsxs("button",{type:"button",onClick:r=>{r.stopPropagation(),ie(t.bill_id,t.bill_number)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded border border-green-300 dark:border-green-700",children:[e.jsx(de,{className:"w-3.5 h-3.5"})," Mark Paid"]}),e.jsxs("button",{type:"button",onClick:r=>{r.stopPropagation(),le(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded",children:[e.jsx("svg",{className:"w-3.5 h-3.5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]})]})]},`${t.bill_id}-${t.displayPaymentType??t.payment_type}`)})}),W>1&&e.jsxs("div",{className:"flex-shrink-0 flex items-center justify-center gap-1 mt-1.5",children:[e.jsx("button",{type:"button",onClick:()=>C(t=>Math.max(1,t-1)),disabled:P===1,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Previous"}),e.jsx("div",{className:"flex gap-1",children:Array.from({length:W},(t,a)=>a+1).map(t=>e.jsx("button",{type:"button",onClick:()=>C(t),className:`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${P===t?"bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-md":"bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`,children:t},t))}),e.jsx("button",{type:"button",onClick:()=>C(t=>Math.min(W,t+1)),disabled:P===W,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Next"})]}),e.jsx("div",{className:"flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2",children:e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsxs("div",{className:"flex items-center gap-6",children:[e.jsxs("div",{children:[e.jsxs("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:["Page ",P," of ",W||1]}),e.jsxs("p",{className:"text-slate-300 dark:text-gray-300 text-xs font-semibold",children:[ae.length," items"]})]}),e.jsxs("div",{className:"border-l border-slate-600 pl-6",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:"Page Total"}),e.jsxs("p",{className:"text-yellow-400 text-sm font-bold",children:["₹",ae.reduce((t,a)=>t+a.displayAmount,0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:h==="all"?`Grand Total (${$.length} bills)${j!=="all"?` • ${j==="today"?"Today":"Custom"}`:""}`:`${((xe=_.find(t=>t.payment_type_id===h))==null?void 0:xe.payment_name)||h} (${new Set(M.map(t=>t.bill_id)).size} bills)`}),e.jsxs("p",{className:"text-white text-lg font-bold",children:["₹",ke.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]})})]})]}),i&&e.jsxs("div",{className:"fixed inset-0 z-50 flex justify-end",onClick:()=>z(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/40 backdrop-blur-sm"}),e.jsxs("div",{className:"relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Bill #",i.bill_number]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${i.type==="gst"?"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300":"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`,children:i.type==="gst"?"GST":"Non-GST"})]}),e.jsx("button",{type:"button",onClick:()=>z(null),className:"p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors",children:e.jsx(Ae,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700",children:[e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(We,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Customer"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:i.customer_name||"Walk-In"}),i.customer_phone&&e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:i.customer_phone})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Oe,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Date"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:new Date(i.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:new Date(i.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(ye,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Payment"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:i.payment_type?(()=>{const t=i.payment_type;if(typeof t=="string"&&t.trim().startsWith("["))try{const a=JSON.parse(t);return Array.isArray(a)?a.map(r=>`${r.payment_type||r.PAYMENT_TYPE||""}${r.amount||r.AMOUNT?` ₹${r.amount||r.AMOUNT}`:""}`).join(" + "):t}catch{return t}return t})():"—"})]})]}),i.status==="cancelled"&&e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(re,{className:"w-4 h-4 text-red-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Status"}),e.jsx("p",{className:"text-sm text-red-500 font-medium",children:"Cancelled"})]})]})]}),e.jsxs("div",{className:"px-5 py-4 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(Ye,{className:"w-4 h-4 text-gray-400"}),e.jsx("h3",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase",children:"Items"})]}),i.items&&i.items.length>0?e.jsx("div",{className:"space-y-2",children:i.items.map((t,a)=>e.jsxs("div",{className:"flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200 truncate",children:t.product_name}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:[t.quantity," × ₹",(t.rate||0).toLocaleString("en-IN"),t.gst_percentage?` + ${t.gst_percentage}% GST`:""]})]}),e.jsxs("p",{className:"text-sm font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3",children:["₹",(t.amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},a))}):e.jsx("p",{className:"text-sm text-gray-400 italic",children:"No item details available"})]}),e.jsxs("div",{className:"px-5 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-2",children:[i.type==="gst"&&i.subtotal!==void 0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsx("span",{children:"Subtotal"}),e.jsxs("span",{children:["₹",(i.subtotal||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),i.gst_amount!==void 0&&i.gst_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsxs("span",{children:["GST (",i.gst_percentage||0,"%)"]}),e.jsxs("span",{children:["₹",(i.gst_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),i.discount_amount!==void 0&&i.discount_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-red-500",children:[e.jsxs("span",{children:["Discount ",i.discount_percentage?`(${i.discount_percentage}%)`:""]}),e.jsxs("span",{children:["-₹",(i.discount_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700",children:[e.jsx("span",{children:"Total"}),e.jsxs("span",{children:["₹",((i.final_amount??i.total_amount)||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),i.payment_status==="pending"&&i.status!=="cancelled"&&e.jsxs("div",{className:"mt-3 flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-amber-600 dark:text-amber-400 text-sm",children:"⏳"}),e.jsx("span",{className:"text-sm font-semibold text-amber-700 dark:text-amber-400",children:"Payment Pending"})]}),e.jsxs("button",{type:"button",onClick:()=>ie(i.bill_id,i.bill_number),className:"inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition",children:[e.jsx(de,{className:"w-3.5 h-3.5"}),"Mark Paid"]})]}),e.jsx("div",{className:"mt-3 flex gap-2",children:e.jsxs("button",{type:"button",onClick:()=>le(i),className:"flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-700 transition",children:[e.jsx("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"Download PDF"]})})]})]})]}),E&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>F(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(re,{className:"w-5 h-5 text-red-600 dark:text-red-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Cancel Bill #",E.billNumber,"?"]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:"This will restore all item quantities to stock."})]})]}),e.jsxs("div",{className:"flex gap-2 mt-5",children:[e.jsx("button",{type:"button",onClick:()=>F(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition",children:"No, Keep Bill"}),e.jsx("button",{type:"button",onClick:$e,className:"flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition",children:"Yes, Cancel Bill"})]})]})]})]})}export{wt as default};
