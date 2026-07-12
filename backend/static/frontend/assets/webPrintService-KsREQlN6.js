import{Q as G}from"./browser-BmVzNun3.js";import{f as A}from"./billNumber-Bj2_t-HG.js";import{C as N}from"./regions-CQrqqUPI.js";import"./vendor-B1q2mvm2.js";const B={PAPER_WIDTH:"58mm",FONT_SIZE:"8pt",FONT_SIZE_LARGE:"11pt",FONT_SIZE_XLARGE:"13pt",FONT_SIZE_SMALL:"7pt",ITEM_NAME_MAX:18};function L(e){let t=e;!e.endsWith("Z")&&!e.includes("+")&&!e.includes("T")?t=e+"T00:00:00Z":e.includes("T")&&!e.endsWith("Z")&&!e.includes("+")&&(t=e+"Z");const a=new Date(t),o={timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"};return new Intl.DateTimeFormat("en-GB",o).format(a)}function W(e){let t=e;return e.includes("T")&&!e.endsWith("Z")&&!e.includes("+")&&(t=e+"Z"),new Date(t).toLocaleTimeString("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!0})}function E(e){return e<100?e.toFixed(2):Math.round(e).toString()}function c(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function O(e){if(e.currency_symbol)return e.currency_symbol;if(e.currency_code&&N[e.currency_code])return N[e.currency_code];try{const t=JSON.parse(localStorage.getItem("client")||"{}");if(t.currency_symbol)return t.currency_symbol;if(t.currency_code&&N[t.currency_code])return N[t.currency_code]}catch{}return"₹"}function q(e){var t,a,o;if((a=(t=e.tax_breakdown)==null?void 0:t[0])!=null&&a.name)return e.tax_breakdown[0].name;try{const r=JSON.parse(localStorage.getItem("client")||"{}");if((o=r.tax_config)!=null&&o.name)return r.tax_config.name}catch{}return"GST"}async function H(e,t,a,o){if(!e)return"";try{const r=[`pa=${e}`,`pn=${encodeURIComponent(t||"Shop")}`];a!==void 0&&Number.isFinite(Number(a))&&Number(a)>0&&(r.push(`am=${Number(a).toFixed(2)}`),r.push("cu=INR")),o!=null&&String(o).trim()!==""&&r.push(`tn=${encodeURIComponent(`Bill ${o}`)}`);const i=`upi://pay?${r.join("&")}`;return await G.toDataURL(i,{width:150,margin:1,errorCorrectionLevel:"M"})}catch{return""}}function F(e,t,a=!0,o){const{PAPER_WIDTH:r,FONT_SIZE:i,FONT_SIZE_LARGE:d,FONT_SIZE_XLARGE:h,FONT_SIZE_SMALL:s,ITEM_NAME_MAX:y}=B,g=O(e),T=q(e),_=e.items.length;e.items.reduce((n,m)=>n+Number(m.quantity),0);const f=Number(e.subtotal)||0,u=Number(e.gst_amount)||0,R=Number(e.negotiable_amount)||0,U=Number(e.discount_amount)||0,$=R>0?R:U,v=Number(e.membership_redeemed)||0;let w=0;e.type==="gst"?w=f+u-$-v:w=f-$-v,w=Math.max(0,w);const z=Math.round(w);let b=0;for(const n of e.items){const m=Number(n.mrp)>0?Number(n.mrp):Number(n.rate),l=Number(n.rate),p=Number(n.quantity);m>l&&(b+=(m-l)*p)}b+=$+v;let x="";try{const n=JSON.parse(e.payment_type);Array.isArray(n)&&n.length>0?x=n.map(m=>`${m.payment_type}: ${parseFloat(String(m.amount)).toFixed(2)}`).join(", "):x=c(e.payment_type)}catch{x=c(e.payment_type)}let P=0,k=0;for(const n of e.items){const m=Number(n.mrp)>0?Number(n.mrp):Number(n.rate),l=Number(n.rate),p=Number(n.quantity);P+=m*p,k+=l*p}let D="";for(const n of e.items){const m=n.product_name,l=Number(n.mrp)>0?Number(n.mrp):Number(n.rate),p=Number(n.rate),C=Number(n.quantity),I=Number(n.amount),M=Number(n.discount_percentage||0),Z=M>0?`<div class="item-discount-note">${M}% discount</div>`:"";D+=`
    <div class="item-row">
      <span class="col-product">${c(m)}${Z}</span>
      <span class="col-qty">${C}</span>
      <span class="col-mrp">${E(l)}</span>
      <span class="col-rate">${E(p)}</span>
      <span class="col-amt">${E(I)}</span>
    </div>`}let S="";if(e.type==="gst"&&u>0){const n=f,l=(e.tax_breakdown&&e.tax_breakdown.length>0?e.tax_breakdown:[{name:"CGST",amount:u/2},{name:"SGST",amount:u/2}]).map(p=>`${p.name} = ${Number(p.amount).toFixed(2)}`).join(" - ");S=`${T} ${e.gst_percentage||18}% on ${n.toFixed(2)} - ${l}`}return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${A(e)}</title>
  <style>
    @page { size: 80mm auto; margin: 0mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      body { width: ${r} !important; margin: 0 auto !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      width: ${r};
      max-width: ${r};
      background: #fff;
      color: #000;
      font-size: ${i};
      font-weight: 600;
      line-height: 1.3;
      padding: 1mm 0mm;
      margin: 0 auto;
      letter-spacing: -0.3px;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .dashed { border-bottom: 1px dashed #000; margin: 1.5mm 0; }
    .row { margin-bottom: 0.5mm; }
    .row-flex { display: flex; justify-content: space-between; margin-bottom: 0.5mm; }
    .item-header, .item-row {
      display: flex;
      font-size: ${s};
      margin-bottom: 0.5mm;
    }
    .item-header { font-weight: 700; }
    .col-product { flex: 1; min-width: 0; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; }
    .col-qty { width: 8mm; text-align: center; flex-shrink: 0; }
    .col-mrp { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-rate { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-amt { width: 12mm; text-align: right; font-weight: 700; flex-shrink: 0; }
    .item-discount-note { font-size: ${s}; font-style: italic; opacity: 0.75; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="center bold" style="font-size: ${h}; margin-bottom: 1mm;">${c(t.client_name||"Business Name")}</div>
  ${t.address?`<div class="center" style="font-size: ${s};">${c(t.address).replace(/\n/g,"<br>")}</div>`:""}
  ${t.address2?`<div class="center" style="font-size: ${s};">${c(t.address2)}</div>`:""}
  ${t.phone?`<div class="center" style="font-size: ${s};">${c(t.phone)}</div>`:""}
  ${t.gstin?`<div class="center bold" style="font-size: ${s};">GST NO : ${c(t.gstin)}</div>`:""}
  <div class="dashed"></div>

  <!-- Bill Info -->
  <div style="font-size: ${s};">
    <div class="row-flex"><span><strong>Bill No  :</strong> ${A(e)}</span><span>${x}</span></div>
    <div class="row"><strong>Date     :</strong> ${L(e.created_at)}</div>
    <div class="row"><strong>Time     :</strong> ${W(e.created_at)}</div>
  </div>
  <div class="dashed"></div>

  <!-- Items Header -->
  <div class="item-header">
    <span class="col-product">Product</span>
    <span class="col-qty">Qty</span>
    <span class="col-mrp">MRP</span>
    <span class="col-rate">Rate</span>
    <span class="col-amt">Amt</span>
  </div>
  <div class="dashed"></div>

  <!-- Items -->
  ${D}
  <div class="dashed"></div>

  <!-- Totals Summary -->
  <div style="font-size: ${s};">
    <div class="row-flex"><span>Total Items : ${_}</span><span style="font-size: 14px; font-weight: 700;">Total Amount : ${f.toFixed(2)}</span></div>
    <div class="row">Total Mrp : ${P.toFixed(2)}</div>
    <div class="row">Total Rate : ${k.toFixed(2)}</div>
    ${$>0?`<div class="row"><span style="font-size: ${d}; font-weight: 700;">Total Discount : ${$.toFixed(2)}</span></div>`:""}
    ${v>0?`<div class="row"><span style="font-size: ${d}; font-weight: 700;">Points Redeemed${e.membership?` (${e.membership.points_redeemed} pts)`:""} : -${v.toFixed(2)}</span></div>`:""}
    <div class="row"><span style="font-size: 14px; font-weight: 700;">Net Payable : ${z.toFixed(2)}</span></div>
  </div>
  <div class="dashed"></div>

  <!-- Membership summary (earned this bill + balance after) -->
  ${e.membership?`
  <div class="center" style="font-size: ${s}; margin: 1mm 0;">
    Member ${c(e.membership.card_number||"")}
    &middot; Earned ${e.membership.points_earned} pts
    &middot; Balance ${e.membership.points_balance} pts
  </div>
  <div class="dashed"></div>`:""}

  <!-- GST Breakdown (if GST bill) -->
  ${S?`<div class="center" style="font-size: ${s};">${S}</div>`:""}

  <!-- Savings Box -->
  ${b>0?`
  <div style="text-align: center; margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000;">
    <div style="font-size: ${s};">TODAY'S SAVINGS</div>
    <div style="font-size: ${d}; font-weight: bold; margin: 0.5mm 0;">${g}${b.toFixed(2)}</div>
    <div style="font-size: ${s};">You saved compared to MRP!</div>
  </div>`:""}

  <!-- UPI QR Code -->
  ${o?`
  <div style="text-align: center; margin: 2mm 0;">
    <div style="font-size: ${s}; font-weight: bold;">Scan to Pay ${g}${z}</div>
    <img src="${o}" style="width: 18mm; height: 18mm; margin: 0.5mm 0;" />
    <div style="font-size: 6pt;">UPI: ${c(t.upi_id||"")}</div>
  </div>
  `:t.upi_id?`<div class="center" style="font-size: ${s}; margin-top: 1mm;">UPI: ${c(t.upi_id)}</div>`:""}

  <!-- Footer -->
  <div class="center bold" style="font-size: ${i}; margin-top: 2mm;">${c(t.receipt_footer||"Sorry, No Exchange / No Refund")}</div>
</body>
</html>`}async function j(e,t,a=!0){var o;try{const r=e.type==="gst"?Number(e.final_amount):Number(e.total_amount),i=t.upi_id?await H(t.upi_id,t.client_name||"",r,e.bill_number):void 0,d=F(e,t,a,i),h=document.getElementById("print-iframe");h&&h.remove();const s=document.createElement("iframe");s.id="print-iframe",s.style.position="fixed",s.style.right="0",s.style.bottom="0",s.style.width="0",s.style.height="0",s.style.border="none",s.style.visibility="hidden",document.body.appendChild(s);const y=s.contentDocument||((o=s.contentWindow)==null?void 0:o.document);if(!y)return{success:!1,method:"browser",message:"Could not access iframe document for printing."};let g=!1;const T=()=>{var _,f;if(!g){g=!0;try{(_=s.contentWindow)==null||_.focus(),(f=s.contentWindow)==null||f.print()}catch{}setTimeout(()=>{const u=document.getElementById("print-iframe");u&&u.remove()},5e3)}};return y.open(),y.write(d),y.close(),setTimeout(T,100),{success:!0,method:"browser",message:"Print dialog opened successfully"}}catch(r){return{success:!1,method:"browser",message:r instanceof Error?r.message:"Print failed"}}}function Q(e,t,a=!0){try{const o=F(e,t,a),r=new Blob([o],{type:"text/html"}),i=URL.createObjectURL(r);return window.open(i,"_blank")?(setTimeout(()=>URL.revokeObjectURL(i),1e4),{success:!0,method:"browser",message:"PDF opened in new tab"}):{success:!1,method:"browser",message:"Could not open new tab. Please allow popups for this site."}}catch(o){return{success:!1,method:"browser",message:o instanceof Error?o.message:"PDF generation failed"}}}function Y(e,t){try{const a=e.type==="gst"?e.final_amount:e.total_amount,o=L(e.created_at),r=O(e),i=encodeURIComponent(`*${t.client_name||"Bill"}*
━━━━━━━━━━━━━━━
Bill No: ${A(e)}
Date: ${o}
━━━━━━━━━━━━━━━
Items: ${e.items.length}
Total: ${r}${Math.round(Number(a))}
Payment: ${e.payment_type}
━━━━━━━━━━━━━━━
Thank you for your purchase!`),d=e.customer_phone?e.customer_phone.replace(/\D/g,""):"",h=d?`https://wa.me/${d.startsWith("91")?d:"91"+d}?text=${i}`:`https://wa.me/?text=${i}`;return window.open(h,"_blank"),{success:!0,method:"browser",message:"WhatsApp opened"}}catch(a){return{success:!1,method:"browser",message:a instanceof Error?a.message:"WhatsApp share failed"}}}const ee={generateReceiptHtml:F,printBill:j,downloadPdf:Q,shareWhatsApp:Y,RECEIPT_CONFIG:B};export{ee as default,Q as downloadPdf,F as generateReceiptHtml,H as generateUpiQrDataUrl,j as printBill,Y as shareWhatsApp};
