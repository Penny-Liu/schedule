import{c}from"./index-Db4cECJe.js";/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const a=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],r=c("chevron-up",a),d=async t=>{var n;try{if((n=navigator.clipboard)!=null&&n.writeText)return await navigator.clipboard.writeText(t),!0}catch{}const o=document.activeElement,e=document.createElement("textarea");try{return e.value=t,e.readOnly=!0,e.style.cssText="position:fixed;top:0;left:0;opacity:0;font-size:16px;",document.body.appendChild(e),e.focus(),e.select(),e.setSelectionRange(0,t.length),document.execCommand("copy")}catch{return!1}finally{e.remove(),o instanceof HTMLElement&&o.focus({preventScroll:!0})}},p=()=>{var t;return typeof window<"u"&&window.isSecureContext===!0&&typeof navigator<"u"&&typeof((t=navigator.clipboard)==null?void 0:t.write)=="function"&&typeof ClipboardItem<"u"};export{r as C,d as a,p as c};
