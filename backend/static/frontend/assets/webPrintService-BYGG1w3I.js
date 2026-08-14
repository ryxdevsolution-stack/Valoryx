import{Q as W}from"./browser-BmVzNun3.js";import{f as z}from"./billNumber-Bj2_t-HG.js";import{C as T}from"./regions-CQrqqUPI.js";import"./vendor-B1q2mvm2.js";const L={PAPER_WIDTH:"58mm",FONT_SIZE:"8pt",FONT_SIZE_LARGE:"11pt",FONT_SIZE_XLARGE:"13pt",FONT_SIZE_SMALL:"7pt",ITEM_NAME_MAX:18};function O(e){let t=e;!e.endsWith("Z")&&!e.includes("+")&&!e.includes("T")?t=e+"T00:00:00Z":e.includes("T")&&!e.endsWith("Z")&&!e.includes("+")&&(t=e+"Z");const r=new Date(t),o={timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"};return new Intl.DateTimeFormat("en-GB",o).format(r)}function H(e){let t=e;return e.includes("T")&&!e.endsWith("Z")&&!e.includes("+")&&(t=e+"Z"),new Date(t).toLocaleTimeString("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!0})}function R(e){return e<100?e.toFixed(2):Math.round(e).toString()}function c(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function U(e){if(e.currency_symbol)return e.currency_symbol;if(e.currency_code&&T[e.currency_code])return T[e.currency_code];try{const t=JSON.parse(localStorage.getItem("client")||"{}");if(t.currency_symbol)return t.currency_symbol;if(t.currency_code&&T[t.currency_code])return T[t.currency_code]}catch{}return"₹"}function j(e){var t,r,o;if((r=(t=e.tax_breakdown)==null?void 0:t[0])!=null&&r.name)return e.tax_breakdown[0].name;try{const a=JSON.parse(localStorage.getItem("client")||"{}");if((o=a.tax_config)!=null&&o.name)return a.tax_config.name}catch{}return"GST"}async function Q(e,t,r,o){if(!e)return"";try{const a=[`pa=${e}`,`pn=${encodeURIComponent(t||"Shop")}`];r!==void 0&&Number.isFinite(Number(r))&&Number(r)>0&&(a.push(`am=${Number(r).toFixed(2)}`),a.push("cu=INR")),o!=null&&String(o).trim()!==""&&a.push(`tn=${encodeURIComponent(`Bill ${o}`)}`);const i=`upi://pay?${a.join("&")}`;return await W.toDataURL(i,{width:150,margin:1,errorCorrectionLevel:"M"})}catch{return""}}function P(e,t,r=!0,o){const{PAPER_WIDTH:a,FONT_SIZE:i,FONT_SIZE_LARGE:u,FONT_SIZE_XLARGE:y,FONT_SIZE_SMALL:n,ITEM_NAME_MAX:d}=L,g=U(e),S=j(e),_=e.items.length;e.items.reduce((s,m)=>s+Number(m.quantity),0);const l=Number(e.subtotal)||0,h=Number(e.gst_amount)||0,k=Number(e.negotiable_amount)||0,C=Number(e.discount_amount)||0,$=k>0?k:C,w=Number(e.membership_redeemed)||0;let v=0;e.type==="gst"?v=l+h-$-w:v=l-$-w,v=Math.max(0,v);const b=Math.round(v),D=e.paid_amount!=null?Number(e.paid_amount):e.payment_status==="pending"?0:b,F=e.balance_due!=null?Number(e.balance_due):Math.max(b-D,0);let x=0;for(const s of e.items){const m=Number(s.mrp)>0?Number(s.mrp):Number(s.rate),f=Number(s.rate),p=Number(s.quantity);m>f&&(x+=(m-f)*p)}x+=$+w;let N="";try{const s=JSON.parse(e.payment_type);Array.isArray(s)&&s.length>0?N=s.map(m=>`${m.payment_type}: ${parseFloat(String(m.amount)).toFixed(2)}`).join(", "):N=c(e.payment_type)}catch{N=c(e.payment_type)}let M=0,A=0;for(const s of e.items){const m=Number(s.mrp)>0?Number(s.mrp):Number(s.rate),f=Number(s.rate),p=Number(s.quantity);M+=m*p,A+=f*p}let B="";for(const s of e.items){const m=s.product_name,f=Number(s.mrp)>0?Number(s.mrp):Number(s.rate),p=Number(s.rate),Z=Number(s.quantity),G=Number(s.amount),I=Number(s.discount_percentage||0),q=I>0?`<div class="item-discount-note">${I}% discount</div>`:"";B+=`
    <div class="item-row">
      <span class="col-product">${c(m)}${q}</span>
      <span class="col-qty">${Z}</span>
      <span class="col-mrp">${R(f)}</span>
      <span class="col-rate">${R(p)}</span>
      <span class="col-amt">${R(G)}</span>
    </div>`}let E="";if(e.type==="gst"&&h>0){const s=l,f=(e.tax_breakdown&&e.tax_breakdown.length>0?e.tax_breakdown:[{name:"CGST",amount:h/2},{name:"SGST",amount:h/2}]).map(p=>`${p.name} = ${Number(p.amount).toFixed(2)}`).join(" - ");E=`${S} ${e.gst_percentage||18}% on ${s.toFixed(2)} - ${f}`}return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${z(e)}</title>
  <style>
    @page { size: 80mm auto; margin: 0mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      body { width: ${a} !important; margin: 0 auto !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      width: ${a};
      max-width: ${a};
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
      font-size: ${n};
      margin-bottom: 0.5mm;
    }
    .item-header { font-weight: 700; }
    .col-product { flex: 1; min-width: 0; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; }
    .col-qty { width: 8mm; text-align: center; flex-shrink: 0; }
    .col-mrp { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-rate { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-amt { width: 12mm; text-align: right; font-weight: 700; flex-shrink: 0; }
    .item-discount-note { font-size: ${n}; font-style: italic; opacity: 0.75; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="center bold" style="font-size: ${y}; margin-bottom: 1mm;">${c(t.client_name||"Business Name")}</div>
  ${t.address?`<div class="center" style="font-size: ${n};">${c(t.address).replace(/\n/g,"<br>")}</div>`:""}
  ${t.address2?`<div class="center" style="font-size: ${n};">${c(t.address2)}</div>`:""}
  ${t.phone?`<div class="center" style="font-size: ${n};">${c(t.phone)}</div>`:""}
  ${t.gstin?`<div class="center bold" style="font-size: ${n};">GST NO : ${c(t.gstin)}</div>`:""}
  <div class="dashed"></div>

  <!-- Bill Info -->
  <div style="font-size: ${n};">
    <div class="row-flex"><span><strong>Bill No  :</strong> ${z(e)}</span><span>${N}</span></div>
    <div class="row"><strong>Date     :</strong> ${O(e.created_at)}</div>
    <div class="row"><strong>Time     :</strong> ${H(e.created_at)}</div>
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
  ${B}
  <div class="dashed"></div>

  <!-- Totals Summary.
       "Total Rate" (sum of rate x qty) equals "Total Amount" (the subtotal) on
       an ordinary bill, so printing both showed the same figure twice. It is
       kept only when per-line discounts make them differ, where it genuinely
       shows the pre-discount value. The final line is "Grand Total" when
       settled and "Net Payable" only while money is still owed. -->
  <div style="font-size: ${n};">
    <div class="row-flex"><span>Total Items : ${_}</span><span style="font-size: 14px; font-weight: 700;">Total Amount : ${l.toFixed(2)}</span></div>
    <div class="row">Total Mrp : ${M.toFixed(2)}</div>
    ${Math.abs(A-l)>.01?`<div class="row">Total Rate : ${A.toFixed(2)}</div>`:""}
    ${$>0?`<div class="row"><span style="font-size: ${u}; font-weight: 700;">Total Discount : ${$.toFixed(2)}</span></div>`:""}
    ${w>0?`<div class="row"><span style="font-size: ${u}; font-weight: 700;">Points Redeemed${e.membership?` (${e.membership.points_redeemed} pts)`:""} : -${w.toFixed(2)}</span></div>`:""}
    <div class="row"><span style="font-size: 14px; font-weight: 700;">${F>0?"Net Payable":"Grand Total"} : ${b.toFixed(2)}</span></div>
    ${F>0?`
    <div class="row"><span style="font-size: 14px; font-weight: 700;">Paid Amount : ${D.toFixed(2)}</span></div>
    <div class="row"><span style="font-size: 14px; font-weight: 700;">Balance Due : ${F.toFixed(2)}</span></div>`:""}
  </div>
  <div class="dashed"></div>

  <!-- Membership summary (earned this bill + balance after) -->
  ${e.membership?`
  <div class="center" style="font-size: ${n}; margin: 1mm 0;">
    Member ${c(e.membership.card_number||"")}
    &middot; Earned ${e.membership.points_earned} pts
    &middot; Balance ${e.membership.points_balance} pts
  </div>
  <div class="dashed"></div>`:""}

  <!-- GST Breakdown (if GST bill) -->
  ${E?`<div class="center" style="font-size: ${n};">${E}</div>`:""}

  <!-- Savings Box -->
  ${x>0?`
  <div style="text-align: center; margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000;">
    <div style="font-size: ${n};">TODAY'S SAVINGS</div>
    <div style="font-size: ${u}; font-weight: bold; margin: 0.5mm 0;">${g}${x.toFixed(2)}</div>
    <div style="font-size: ${n};">You saved compared to MRP!</div>
  </div>`:""}

  <!-- UPI QR Code -->
  ${o?`
  <div style="text-align: center; margin: 2mm 0;">
    <div style="font-size: ${n}; font-weight: bold;">Scan to Pay ${g}${b}</div>
    <img src="${o}" style="width: 18mm; height: 18mm; margin: 0.5mm 0;" />
    <div style="font-size: 6pt;">UPI: ${c(t.upi_id||"")}</div>
  </div>
  `:t.upi_id?`<div class="center" style="font-size: ${n}; margin-top: 1mm;">UPI: ${c(t.upi_id)}</div>`:""}

  <!-- Footer -->
  <div class="center bold" style="font-size: ${i}; margin-top: 2mm;">${c(t.receipt_footer||"Sorry, No Exchange / No Refund")}</div>
</body>
</html>`}async function Y(e,t,r=!0){var o;try{const a=e.type==="gst"?Number(e.final_amount):Number(e.total_amount),i=t.upi_id?await Q(t.upi_id,t.client_name||"",a,e.bill_number):void 0,u=P(e,t,r,i),y=document.getElementById("print-iframe");y&&y.remove();const n=document.createElement("iframe");n.id="print-iframe",n.style.position="fixed",n.style.right="0",n.style.bottom="0",n.style.width="0",n.style.height="0",n.style.border="none",n.style.visibility="hidden",document.body.appendChild(n);const d=n.contentDocument||((o=n.contentWindow)==null?void 0:o.document);if(!d)return{success:!1,method:"browser",message:"Could not access iframe document for printing."};let g=!1;const S=()=>{var _,l;if(!g){g=!0;try{(_=n.contentWindow)==null||_.focus(),(l=n.contentWindow)==null||l.print()}catch{}setTimeout(()=>{const h=document.getElementById("print-iframe");h&&h.remove()},5e3)}};return d.open(),d.write(u),d.close(),setTimeout(S,100),{success:!0,method:"browser",message:"Print dialog opened successfully"}}catch(a){return{success:!1,method:"browser",message:a instanceof Error?a.message:"Print failed"}}}function X(e,t,r=!0){try{const o=P(e,t,r),a=new Blob([o],{type:"text/html"}),i=URL.createObjectURL(a);return window.open(i,"_blank")?(setTimeout(()=>URL.revokeObjectURL(i),1e4),{success:!0,method:"browser",message:"PDF opened in new tab"}):{success:!1,method:"browser",message:"Could not open new tab. Please allow popups for this site."}}catch(o){return{success:!1,method:"browser",message:o instanceof Error?o.message:"PDF generation failed"}}}function J(e,t){try{const r=e.type==="gst"?e.final_amount:e.total_amount,o=O(e.created_at),a=U(e),i=Math.round(Number(r)),u=e.paid_amount!=null?Number(e.paid_amount):e.payment_status==="pending"?0:i,y=e.balance_due!=null?Number(e.balance_due):Math.max(i-u,0),n=encodeURIComponent(`*${t.client_name||"Bill"}*
━━━━━━━━━━━━━━━
Bill No: ${z(e)}
Date: ${o}
━━━━━━━━━━━━━━━
Items: ${e.items.length}
Total: ${a}${i}
`+(y>0?`Paid: ${a}${u.toFixed(2)}
Balance Due: ${a}${y.toFixed(2)}
`:"")+`Payment: ${e.payment_type}
━━━━━━━━━━━━━━━
Thank you for your purchase!`),d=e.customer_phone?e.customer_phone.replace(/\D/g,""):"",g=d?`https://wa.me/${d.startsWith("91")?d:"91"+d}?text=${n}`:`https://wa.me/?text=${n}`;return window.open(g,"_blank"),{success:!0,method:"browser",message:"WhatsApp opened"}}catch(r){return{success:!1,method:"browser",message:r instanceof Error?r.message:"WhatsApp share failed"}}}const ne={generateReceiptHtml:P,printBill:Y,downloadPdf:X,shareWhatsApp:J,RECEIPT_CONFIG:L};export{ne as default,X as downloadPdf,P as generateReceiptHtml,Q as generateUpiQrDataUrl,Y as printBill,J as shareWhatsApp};
