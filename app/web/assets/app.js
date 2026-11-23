const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={regions:[],shelves:[],pockets:[],documents:[],used:0},selected='all',currentTab='offline',query='',regionQuery='',shelfQueries={},collapsedShelves=new Set(),knownShelfIds=new Set(),collapsedPockets=new Set(),knownPocketIds=new Set(),lastUpdated=null,searchIndex=[],searchLimit=60,searchTimer=0;
let collectionPhotos={};
fetch('/assets/collection-photos/manifest.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json()}).then(photos=>{collectionPhotos=photos;decorateCollectionIcons()}).catch(error=>console.warn('Impossible de charger les photos des rayons, étagères et poches.',error));
const icons={grid:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',folder:'<svg viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',shelf:'<svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16M7 5v7m6-7v7m5-7v7M8 12v7m7-7v7"/></svg>',file:'<svg viewBox="0 0 24 24"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M8 15h8m-8 3h6"/></svg>',open:'<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',download:'<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3"/></svg>',trash:'<svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0-1 14H6L5 6m3 0V4h8v2m-7 4v6m4-6v6"/></svg>',link:'<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'};
const collectionArt={
 folder:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 12a3 3 0 0 1 3-3h9l4 4h11a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="1.5"/><path d="M5 17h30l-3 13H8z" fill="currentColor" opacity=".3" stroke="currentColor" stroke-width="1.5"/></svg>',
 books:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 11h8v22H7z" fill="#60a5fa" opacity=".55" stroke="currentColor" stroke-width="1.3"/><path d="M17 8h8v25h-8z" fill="#a78bfa" opacity=".5" stroke="currentColor" stroke-width="1.3"/><path d="M27 13h7v20h-7z" fill="#34d399" opacity=".5" stroke="currentColor" stroke-width="1.3"/><path d="M5 34h30M9 15h4m7-3h4m-4 5h4m5 0h3" stroke="currentColor" stroke-width="1.5"/></svg>',
 tech:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="8" width="28" height="21" rx="3" fill="#60a5fa" opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M10 12h20v13H10z" fill="#60a5fa" opacity=".35"/><path d="M16 34h8m-4-5v5m-5-13 3-3-3-3m6 6h4" stroke="currentColor" stroke-width="1.7"/></svg>',
 games:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 13h16a7 7 0 0 1 6.8 5.4l2 8a4 4 0 0 1-6.4 4l-5.2-4H14.8l-5.2 4a4 4 0 0 1-6.4-4l2-8A7 7 0 0 1 12 13z" fill="#8b5cf6" fill-opacity=".22" stroke="currentColor" stroke-width="1.6"/><path d="M12 18v8m-4-4h8" stroke="currentColor" stroke-width="2"/><circle cx="27" cy="20" r="1.5" fill="#fbbf24"/><circle cx="31" cy="24" r="1.5" fill="#34d399"/></svg>',
 media:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="9" width="23" height="26" rx="3" fill="#a78bfa" fill-opacity=".19" stroke="currentColor" stroke-width="1.5"/><path d="M12 9v26m11-26v26m-8-17 8 4-8 4z" fill="currentColor" stroke="none"/><rect x="12" y="5" width="23" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M18 5v26m11-26v26" stroke="currentColor" stroke-width="1.1" opacity=".7"/></svg>',
 science:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 7h10m-7 0v10L9 31a3 3 0 0 0 3 4h16a3 3 0 0 0 3-4l-9-14V7" fill="#a78bfa" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><path d="M13 27h14m-10-5h6" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="29" r="1" fill="#a78bfa" stroke="none"/><circle cx="24" cy="25" r="1" fill="#60a5fa" stroke="none"/></svg>',
 mixedScience:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 8h9m-6 0v9L6 30a3 3 0 0 0 3 4h9a3 3 0 0 0 3-4l-5-13V8" fill="#34d399" fill-opacity=".16" stroke="currentColor" stroke-width="1.4"/><path d="M8 27h10" stroke="currentColor" stroke-width="1.4"/><ellipse cx="29" cy="19" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.3"/><ellipse cx="29" cy="19" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.3" transform="rotate(60 29 19)"/><circle cx="29" cy="19" r="2" fill="#60a5fa" stroke="none"/></svg>',
 dataScience:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 33h27M10 30V20h5v10m4 0V12h5v18m4 0V7h5v23" fill="#60a5fa" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/><circle cx="12.5" cy="16" r="2" fill="#34d399"/><circle cx="22" cy="8" r="2" fill="#c4b5fd"/><circle cx="31" cy="4" r="2" fill="#fbbf24"/></svg>',
 materialScience:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 5 14 8-14 8-14-8zm-14 8v14l14 8 14-8V13M20 21v14" fill="#38bdf8" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/><path d="m13 9 14 8m-14 0 14-8M6 20l14 8 14-8" fill="none" stroke="#34d399" stroke-width="1.2"/></svg>',
 signalSystems:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 20h5l4-10 7 20 5-15 4 5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="20" r="2" fill="#60a5fa"/><circle cx="35" cy="20" r="2" fill="#34d399"/><path d="M8 7h24M8 33h24" fill="none" stroke="currentColor" stroke-width="1" opacity=".35"/></svg>',
 dataSecurity:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 33 9v9c0 9-5 14-13 18C12 32 7 27 7 18V9z" fill="#34d399" fill-opacity=".17" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="17" r="2" fill="#60a5fa"/><circle cx="24" cy="14" r="2" fill="#c4b5fd"/><circle cx="22" cy="24" r="2" fill="#fbbf24"/><path d="m17.7 16.4 4.5-1.7m-5 4 3.8 4m3.7-6.7-1.6 5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
 biochemistry:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 8h8m-5 0v9L6 30a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-13V8" fill="#34d399" fill-opacity=".18" stroke="currentColor" stroke-width="1.4"/><path d="M8 27h11" stroke="currentColor" stroke-width="1.4"/><path d="M27 9c9 4-4 8 5 12s-4 7 3 11m-8-22c-9 4 4 8-5 12s4 7-3 11m4-25h8m-9 8h8m-9 8h8m-9 7h8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
 crafts:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m8 29 16-16 7 7-16 16H8zM21 16l7 7m-17 6 7 7" fill="#fb923c" fill-opacity=".22" stroke="currentColor" stroke-width="1.5"/><path d="m25 10 5-5 5 5-5 5m-18 5-7 7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
 physics:'<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="15" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><ellipse cx="20" cy="20" rx="15" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.7" transform="rotate(60 20 20)"/><ellipse cx="20" cy="20" rx="15" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.7" transform="rotate(120 20 20)"/><circle cx="20" cy="20" r="3.2" fill="#60a5fa" stroke="currentColor" stroke-width="1.2"/><circle cx="33" cy="20" r="2" fill="#fbbf24" stroke="none"/></svg>',
 chemistry:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 6h10m-7 0v11L9 31a3 3 0 0 0 3 4h16a3 3 0 0 0 3-4l-9-14V6" fill="#34d399" fill-opacity=".17" stroke="currentColor" stroke-width="1.7"/><path d="M13 27h14" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="23" r="1.6" fill="#60a5fa" stroke="none"/><circle cx="23" cy="30" r="1.8" fill="#fbbf24" stroke="none"/><circle cx="25" cy="24" r="1.2" fill="#c084fc" stroke="none"/></svg>',
 earthScience:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="#38bdf8" fill-opacity=".16" stroke="currentColor" stroke-width="1.6"/><path d="M8 17h24M7 23h26M11 29h18" stroke="currentColor" stroke-width="1.1" opacity=".75"/><path d="m10 16 5-5 3 3 4-6 7 7m-17 2 5 5 4-4 4 5 6-5m-16 7 5 5 4-4 5 3" fill="#34d399" fill-opacity=".55" stroke="currentColor" stroke-width="1.1"/></svg>',
 biology:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 7c18 6 0 20 18 26M29 7C11 13 29 27 11 33M14 11h12m-14 6h12m4 6H14m14 6H16" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="11" cy="7" r="2" fill="#34d399"/><circle cx="29" cy="33" r="2" fill="#60a5fa"/></svg>',
 mathematics:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="5" width="30" height="30" rx="8" fill="#fbbf24" fill-opacity=".14" stroke="currentColor" stroke-width="1.5"/><path d="M11 13h18M18 13l-5 14m10-14 5 14m-13-5h11" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="31" r="1.2" fill="#60a5fa" stroke="none"/><circle cx="28" cy="31" r="1.2" fill="#60a5fa" stroke="none"/></svg>',
 astronomy:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="22" cy="20" r="9" fill="#a78bfa" fill-opacity=".3" stroke="currentColor" stroke-width="1.5"/><ellipse cx="22" cy="20" rx="16" ry="5" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(-22 22 20)"/><circle cx="7" cy="11" r="1.5" fill="#fbbf24"/><path d="M10 28v5m-2.5-2.5h5M31 7v4m-2 2h4" stroke="currentColor" stroke-width="1.3"/></svg>',
 geography:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="#38bdf8" fill-opacity=".15" stroke="currentColor" stroke-width="1.6"/><path d="M5 20h30M20 5a22 22 0 0 1 0 30m0-30a22 22 0 0 0 0 30M8 12h24m-24 16h24" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m11 15 5-4 3 3-2 4-5 1zm8 8 5-3 5 2-2 5-5 2z" fill="#34d399" fill-opacity=".75" stroke="none"/></svg>',
 psychology:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6a12 12 0 0 0-7 22v5h14v-5a12 12 0 0 0-7-22z" fill="#c4b5fd" fill-opacity=".22" stroke="currentColor" stroke-width="1.6"/><path d="M16 17c0-2 1.5-3 4-3s4 1 4 3-4 3-4 5m0 4v.2M15 33h10" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
 socialScience:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="14" cy="13" r="5" fill="#60a5fa" fill-opacity=".25" stroke="currentColor" stroke-width="1.4"/><circle cx="27" cy="14" r="4" fill="#c4b5fd" fill-opacity=".3" stroke="currentColor" stroke-width="1.4"/><path d="M4 32c0-7 4-11 10-11s10 4 10 11m-1-8c1.5-2 3.5-3 6-3 5 0 8 4 8 10H25" fill="#60a5fa" fill-opacity=".12" stroke="currentColor" stroke-width="1.5"/><path d="M17 27h8m-4-4v8" stroke="currentColor" stroke-width="1.2"/></svg>',
 politics:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 15 20 7l15 8H5zm3 3h24M10 18v13m7-13v13m6-13v13m7-13v13M6 33h28" fill="#60a5fa" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M18 11h4" stroke="currentColor" stroke-width="1.5"/></svg>',
 programming:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="7" width="30" height="26" rx="4" fill="#60a5fa" fill-opacity=".15" stroke="currentColor" stroke-width="1.5"/><path d="m16 15-6 5 6 5m8-10 6 5-6 5m-3-12-3 14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
 engineering:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M22 6a9 9 0 0 0-8 13L7 26a4 4 0 0 0 7 7l7-7a9 9 0 0 0 13-8l-6 5-6-6 5-6a9 9 0 0 0-5-5z" fill="#fbbf24" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><circle cx="11" cy="29" r="1.5" fill="#60a5fa"/></svg>',
 architecture:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 34V17L20 7l14 10v17M4 34h32M12 34V20h16v14M17 20v14m6-14v14M9 16h22" fill="#fb923c" fill-opacity=".15" stroke="currentColor" stroke-width="1.6"/></svg>',
 education:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m4 15 16-8 16 8-16 8z" fill="#60a5fa" fill-opacity=".25" stroke="currentColor" stroke-width="1.5"/><path d="M11 19v9c5 5 13 5 18 0v-9m7-4v12" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="36" cy="29" r="2" fill="#fbbf24" stroke="none"/></svg>',
 poetry:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 7h22v27H9z" fill="#f472b6" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/><path d="M14 14h12m-12 5h9m-9 5h12m-12 5h7" stroke="currentColor" stroke-width="1.5"/><path d="M27 7v6h4" fill="#f472b6" fill-opacity=".35" stroke="currentColor" stroke-width="1.3"/></svg>',
 literature:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 9c6-2 11-1 15 3v22c-4-4-9-5-15-3zm30 0c-6-2-11-1-15 3v22c4-4 9-5 15-3z" fill="#c4b5fd" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><path d="M9 15h7m-7 5h7m8-5h7m-7 5h7" stroke="currentColor" stroke-width="1.2"/></svg>',
 scienceFiction:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 9h18a3 3 0 0 1 3 3v22H10a3 3 0 0 1-3-3z" fill="#a78bfa" fill-opacity=".17" stroke="currentColor" stroke-width="1.5"/><path d="M28 15h5v16a3 3 0 0 1-3 3h-2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m18 14 1.5 4 4.5.5-3.5 2.5 1 4-3.5-2.5-3.5 2.5 1-4-3.5-2.5 4.5-.5z" fill="#fbbf24" stroke="none"/><circle cx="30" cy="10" r="1.5" fill="#60a5fa"/><circle cx="34" cy="7" r="1" fill="#fbbf24"/></svg>',
 security:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 5 33 10v9c0 8-5 13-13 17C12 32 7 27 7 19v-9z" fill="#34d399" fill-opacity=".18" stroke="currentColor" stroke-width="1.6"/><path d="m14 20 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
 pets:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 18c-7-1-12 4-12 10 0 4 3 6 6 4l3-2h6l3 2c3 2 6 0 6-4 0-6-5-11-12-10z" fill="#fb923c" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/><ellipse cx="9" cy="13" rx="3" ry="4" fill="#fb923c" fill-opacity=".4"/><ellipse cx="17" cy="9" rx="3" ry="4" fill="#fb923c" fill-opacity=".4"/><ellipse cx="25" cy="9" rx="3" ry="4" fill="#fb923c" fill-opacity=".4"/><ellipse cx="32" cy="13" rx="3" ry="4" fill="#fb923c" fill-opacity=".4"/></svg>',
 finance:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="11" width="26" height="23" rx="3" fill="#34d399" opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M12 28v-5m6 5V17m6 11v-8m6 8v-12M7 15l9-5 7 3 10-6" stroke="currentColor" stroke-width="1.5"/><circle cx="33" cy="7" r="2" fill="#34d399" stroke="none"/></svg>',
 health:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 34S6 26 6 16a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 10-14 18-14 18z" fill="#fb7185" opacity=".28" stroke="currentColor" stroke-width="1.5"/><path d="M12 21h5l2-5 3 10 2-5h5" stroke="currentColor" stroke-width="1.7"/></svg>',
 art:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6a14 14 0 1 0 0 28h2a3 3 0 0 0 2-5 2.5 2.5 0 0 1 2-4h2A6 6 0 0 0 34 19 14 14 0 0 0 20 6z" fill="#f472b6" opacity=".2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="17" r="2" fill="#60a5fa"/><circle cx="20" cy="12" r="2" fill="#fbbf24"/><circle cx="27" cy="16" r="2" fill="#34d399"/></svg>',
 nature:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M33 7C20 7 9 11 8 22c-.7 7 6 11 12 7C29 24 32 15 33 7z" fill="#34d399" opacity=".25" stroke="currentColor" stroke-width="1.5"/><path d="M7 34c5-9 11-14 21-20m-13 12-1-7m8 2 6-1" stroke="currentColor" stroke-width="1.6"/></svg>',
 travel:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="#38bdf8" opacity=".18" stroke="currentColor" stroke-width="1.5"/><path d="M6 20h28M20 6a22 22 0 0 1 0 28m0-28a22 22 0 0 0 0 28M9 12h22M9 28h22" stroke="currentColor" stroke-width="1.2"/></svg>',
 religion:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 17 20 8l14 9H6zm3 3h22M10 20v11m7-11v11m6-11v11m7-11v11M7 33h26" fill="#fbbf24" fill-opacity=".22" stroke="currentColor" stroke-width="1.6"/><path d="M18 13h4" stroke="currentColor" stroke-width="1.4"/></svg>',
 philosophy:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6a11 11 0 0 0-6 20v4h12v-4a11 11 0 0 0-6-20z" fill="#c4b5fd" fill-opacity=".23" stroke="currentColor" stroke-width="1.6"/><path d="M15 34h10m-9-4h8m-4-18v8m-4-4h8" stroke="currentColor" stroke-width="1.6"/></svg>',
 series:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="6" width="24" height="29" rx="3" fill="#a78bfa" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><path d="M14 6v29m12-29v29" stroke="currentColor" stroke-width="1.2"/><path d="m18 16 8 4-8 4z" fill="currentColor" stroke="none"/></svg>',
 history:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="21" r="14" fill="#fb923c" fill-opacity=".18" stroke="currentColor" stroke-width="1.6"/><path d="M20 12v9l6 4M8 8l4 1-1 4" stroke="currentColor" stroke-width="1.7"/></svg>',
 language:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 9a3 3 0 0 1 3-3h22a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H19l-8 6v-6H9a3 3 0 0 1-3-3z" fill="#38bdf8" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><path d="M13 13h14m-14 6h9" stroke="currentColor" stroke-width="1.8"/></svg>',
 cooking:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 20a6 6 0 0 1 3-11 8 8 0 0 1 16 0 6 6 0 0 1 3 11v13H9z" fill="#fb923c" fill-opacity=".22" stroke="currentColor" stroke-width="1.6"/><path d="M9 21h22m-14 6h8" stroke="currentColor" stroke-width="1.5"/></svg>',
 sport:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="#34d399" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><path d="m20 14 6 4-2 7h-8l-2-7zm0 0v-8m6 12 8-3m-10 10 4 7m-12-7-4 7m2-14-8-3" stroke="currentColor" stroke-width="1.5"/></svg>',
 music:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M23 29V9l12-3v20" fill="#f472b6" fill-opacity=".2" stroke="currentColor" stroke-width="1.8"/><ellipse cx="17" cy="30" rx="6" ry="4" fill="#f472b6" fill-opacity=".3" stroke="currentColor" stroke-width="1.5"/><ellipse cx="29" cy="26" rx="5" ry="3.5" fill="#f472b6" fill-opacity=".3" stroke="currentColor" stroke-width="1.5"/></svg>',
 cinema:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="12" width="28" height="22" rx="2" fill="#f87171" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/><path d="m6 18 8-8m2 8 8-8m2 8 8-8M15 23l11 6-11 5z" fill="currentColor" stroke="currentColor" stroke-width="1.2"/></svg>',
 comics:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 9a3 3 0 0 1 3-3h22a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#f472b6" fill-opacity=".18" stroke="currentColor" stroke-width="1.6"/><path d="M20 7v25M10 13h6m-6 5h6m8-5h6m-6 5h6" stroke="currentColor" stroke-width="1.3"/><path d="m12 27 3-5 3 5z" fill="currentColor" stroke="none"/><circle cx="27" cy="26" r="3" fill="currentColor"/></svg>',
 work:'<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="13" width="28" height="21" rx="3" fill="#fbbf24" opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M15 13V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4m-19 8h28m-17-2v5h6v-5" stroke="currentColor" stroke-width="1.5"/></svg>',
 legal:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 7v26m-10 0h20M11 12h18M14 12l-6 11h12l-6-11zm12 0-6 11h12l-6-11z" fill="#fbbf24" fill-opacity=".16" stroke="currentColor" stroke-width="1.5"/></svg>',
 performingArts:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 11c7-5 15-5 22 0v14c-7-5-15-5-22 0z" fill="#fbbf24" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M35 11c-7-5-15-5-22 0v14c7-5 15-5 22 0z" fill="#c084fc" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M10 17h3m-1.5-1.5v3m12 0c2 2 4 2 6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
 shelf:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 9h28M6 20h28M6 31h28M8 9v11m6-11v11m7-11v11m6-11v11M11 20v11m7-11v11m8-11v11" stroke="currentColor" stroke-width="1.7"/><path d="M8 9h6m7 0h6m-16 11h7m2 0h7" stroke="#60a5fa" stroke-width="2.4"/></svg>',
 pocket:'<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 13a3 3 0 0 1 3-3h8l3 4h11a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#a78bfa" opacity=".2" stroke="currentColor" stroke-width="1.5"/><path d="M6 20h28l-3 11H9z" fill="#a78bfa" opacity=".3" stroke="currentColor" stroke-width="1.5"/><path d="M17 25h6m-3-3v6" stroke="currentColor" stroke-width="1.5"/></svg>'
};
function collectionIconKey(type,name='',id=''){
 const rawName=String(name);
 let parentName='';
 if(type==='shelf'&&id){
  const shelf=state.shelves.find(item=>item.id===id);
  parentName=state.regions.find(item=>item.id===shelf?.region_id)?.name||'';
 }else if(type==='pocket'&&id){
  const pocket=state.pockets.find(item=>item.id===id),shelf=state.shelves.find(item=>item.id===pocket?.shelf_id);
  parentName=`${state.regions.find(item=>item.id===shelf?.region_id)?.name||''} ${shelf?.name||''}`;
 }
 const text=`${rawName} ${parentName}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim().replace(/^(?:cours|notes?|documents?|dossiers?|ressources?|fiches?|supports?|manuels?)\s+(?:de|du|des|d')\s+/,'');
 const fallback=type==='region'?'science':type==='shelf'?'books':'science';
 const compounds=[
  ['mathematics',/\b(?:18\.\d+|6\.042(?:j)?|2\.062(?:j)?)\b/],
  ['programming',/\b(?:6\.\d+|esd\.\d+)\b/],
  ['physics',/\b8\.\d+\b/],
  ['chemistry',/\b5\.\d+\b/],
  ['biology',/\b7\.\d+\b/],
  ['earthScience',/\b12\.\d+\b/],
  ['engineering',/\b(?:1|2|10)\.\d+\b/],
  ['materialScience',/\b3\.\d+\b/],
  ['astronomy',/\b(?:14|20)\.\d+\b/],
  ['socialScience',/\b(?:15|esd)\.\d+\b/],
  ['health',/\bhst\.\d+\b/],
  ['astronomy',/\b(?:eclipse\s+solaire|astrophysique|mecanique\s+celeste)\b/],
  ['programming',/\b(?:poo|freecourse|free\s+course|python|kicad|easyeda|jepa|sml|reseau\s+de\s+neurone)\b/],
  ['media',/\b(?:camera\s+roll|screenshots?|pictures?|videos?|mentaliste|mentalism)\b/],
  ['science',/\b(?:saviez[-\s]?vous|articles?|tp|laboratoire)\b/],
  ['education',/\b(?:a_confirmer|revision|dm|devoirs?|examens?)\b/],
  ['work',/\b(?:logs?|meta|info|autre|general|me|certificat|diplome)\b/],
  ['biology',/\becologie\b/],
  ['dataSecurity',/\bcybersecurite\s+et\s+sciences?\s+des?\s+donnees\b/],
  ['dataScience',/\bintelligence\s+artificielle\s+et\s+data\s+science\b/],
  ['materialScience',/\bscience\s+des\s+materiaux\b/],
  ['signalSystems',/\bsignaux?\s+et\s+systemes?\b/],
  ['mathematics',/\b(?:analyse\s+numerique\s+matricielle|analyse\s+numerique)\b/],
  ['mathematics',/\b(?:outils?\s+mathematiques?|analyse|modelisation|algebre|probabilites?)\b/],
  ['work',/\bprojet\s+personnel\b/],
  ['work',/\bprojets?\s+en\s+cours?\b/],
  ['education',/\b(?:licence|licences)\s+\d+\b/],
  ['education',/\b(?:travaux?\s+pratiques?|tp|dm)\b/],
  ['education',/\b(?:diplomes?|certificats?|attestations?)\b/],
  ['media',/\bmedias?\b/],
  ['books',/\bdocumentation\b/],
  ['books',/\bdocuments?\s+personnels?\b/],
  ['socialScience',/\bassociation\b/],
  ['tech',/\barchives?\s+techniques?\b/],
  ['science',/\bsciences?\s+pluridisciplinaires?\b/],
  ['sport',/\barts?\s+martiaux\b/],
  ['science',/\barticles?\s+scientifiques?\b/],
  ['music',/\bchansons?\s+francaises?\b/],
  ['biochemistry',/\b(?:chimie\s+et\s+biologie|biologie\s+et\s+chimie)\b/],
  ['biology',/\bsciences?\s+naturelles?\b/],
  ['games',/\b(?:creation|developpement|conception)\s+(?:de\s+)?jeux?\s+video\b/],
  ['media',/\b(?:films?\s+et\s+series|series?\s+et\s+films?)\b/],
  ['psychology',/\bdeveloppement\s+personnel\b/],
  ['religion',/\b(?:histoire\s+des?\s+religions?|mythes?\s+(?:grecs?|et\s+legendes?))\b/],
  ['history',/\barcheologie\b/],
  ['education',/\bculture\s+generale\b/],
  ['socialScience',/\beconomie\s+comportementale\b/],
  ['nature',/\b(?:nature\s+et\s+environnement|sciences?\s+de\s+l['’]?\s*environnement|ecologie\s+marine|agriculture|agricole)\b/],
  ['earthScience',/\b(?:meteo|meteorologique)\b/],
  ['astronomy',/\bsciences?\s+de\s+l['’]?\s*espace\b/],
  ['performingArts',/\barts?\s+du\s+spectacle\b/],
  ['cinema',/\bproduction\s+audiovisuelle\b/],
  ['art',/\b(?:photographie|illustration|sculpture|mode|artisanat\s+d['’]?\s*art)\b/],
  ['engineering',/\b(?:energies?\s+(?:renouvelables?|solaire|fossiles?)|electricite|electronique\s+numerique)\b/],
  ['tech',/\b(?:programmation\s+informatique|bases?\s+de\s+donnees|systemes?\s+d['’]?\s*exploitation|logiciels?\s+libres?)\b/],
  ['pets',/\bsoins?\s+aux\s+animaux\b/],
  ['sport',/\b(?:randonnee|marche\s+sportive)\b/],
  ['cooking',/\b(?:alimentation|desserts?)\b/],
  ['finance',/\b(?:commerce|marketing|ressources?\s+humaines?|finance\s+personnelle|comptabilite)\b/],
  ['legal',/\bjustice\b/],
  ['education',/\b(?:examens?|devoirs?)\b/],
  ['work',/\b(?:emploi\s+et\s+formation|gestion\s+de\s+projet)\b/],
  ['mathematics',/\bprobabilites?\b/],
  ['biology',/\b(?:biologie\s+(?:cellulaire|humaine)|sciences?\s+de\s+la\s+vie)\b/],
  ['science',/\bsciences?\s+appliquees\b/],
  ['mixedScience',/\bphysique[\s-]*chimie\b/],
  ['health',/\bcardiologie\b/],
  ['socialScience',/\beconomie\s+sociale\b/],
  ['literature',/\blitterature\s+francaise\b/],
  ['poetry',/\bpoesie\s+francaise\b/],
  ['geography',/\bgeo\b/],
  ['games',/\bjeux?\s+video\b/],
  ['pets',/\bmedecine\s+veterinaire\b/],
  ['media',/\b(?:cinema\s+et\s+series|series?\s+et\s+cinema)\b/],
  ['art',/\bhistoire\s+de\s+l['’]?\s*art\b/],
  ['religion',/\b(?:judaisme|christianisme|bouddhisme|hindouisme)\b/],
  ['politics',/\bphilosophie\s+politique\b/],
  ['socialScience',/\bpsychologie\s+sociale\b/],
  ['health',/\b(?:psychiatrie|nutrition|pharmacologie)\b/],
  ['biology',/\bneurosciences?\b/],
  ['science',/\bsciences?\s+experimentales?\b/],
  ['engineering',/\bgenie\s+civil\b/],
  ['programming',/\b(?:developpement\s+(?:de\s+)?logiciels?|algorithmique)\b/],
  ['crafts',/\b(?:couture|tricot)\b/],
  ['music',/\bcomposition\s+musicale\b/],
  ['engineering',/\benergies?\s+renouvelables?\b/],
  ['sport',/\byoga\b/],
  ['religion',/\bmythologie\b/],
  ['history',/\bprehistoire\b/],
  ['cinema',/\bdocumentaires?\b/],
  ['series',/\banimation\b/],
  ['nature',/\bpermaculture\b/],
  ['philosophy',/\blogique\b/],
  ['health',/\b(?:bien[\s-]*etre|premiers?\s+secours)\b/],
  ['nature',/\b(?:ecologie|ecosystemes?|biodiversite)\b/],
  ['performingArts',/\b(?:theatre|danse|arts?\s+de\s+la\s+scene)\b/],
  ['games',/\b(?:creation|developpement|conception)\s+(?:de\s+)?jeux?\b/],
  ['mixedScience',/\b(?:physique[\s-]*(?:et|&)?[\s-]*chimie|chimie[\s-]*(?:et|&)?[\s-]*physique|sciences?\s+physiques?\s+et\s+chimiques?)\b/],
  ['books',/\blivres?\s+audio\b/],
  ['scienceFiction',/\b(?:science[\s-]+fiction|sci[\s-]?fi)\b/],
  ['dataScience',/\b(?:science\s+des\s+donnees|sciences?\s+des\s+donnees|data\s+science|analyse\s+de\s+donnees|intelligence\s+artificielle|machine\s+learning)\b/],
  ['tech',/\bsciences?\s+et\s+technologie\b/],
  ['geography',/\bhistoire(?:[\s-]+et)?[\s-]+geo(?:graphie)?\b/],
  ['socialScience',/\bscience\s+et\s+societe\b/],
  ['politics',/\beconomie\s+politique\b/],
  ['engineering',/\bmecanique\s+(?:automobile|industrielle|des\s+machines)\b/],
  ['nature',/\bhistoire\s+naturelle\b/],
  ['legal',/\bcode\s+(?:civil|penal|du\s+travail|de\s+la\s+route)\b/],
  ['legal',/\bdroit\s+(?:du\s+travail|penal|civil|constitutionnel|international|administratif)\b/],
  ['security',/\bsecurite\s+informatique\b/],
  ['education',/\bformation\s+professionnelle\b/],
  ['education',/\btravail\s+scolaire\b/]
 ];
 const compound=compounds.find(([,pattern])=>pattern.test(text));
 if(compound)return compound[0];
 const groups=[
  ['earthScience',/\b(sciences?\s+de\s+la\s+terre|geosciences?|geologie|geophysique|mineralogie|paleontologie|oceanographie|meteorologie|climatologie|meteo)\w*\b/],
  ['tech',/\b(technologies?\s+numeriques?|bases?\s+de\s+donnees|systemes?\s+d['’]?\s*exploitation|programmation\s+informatique|informatique|donnees)\w*\b/],
  ['engineering',/\b(mecanique\s+(automobile|industrielle|des\s+machines)|ingenierie|ingenieur|robotique|electronique|automatisme|industrie|electricite)\w*\b/],
  ['legal',/\b(code\s+(civil|penal|du\s+travail|de\s+la\s+route)|lois?\b)/],
  ['art',/\b(techniques?\s+de\s+(dessin|peinture|photo|gravure)|dessin\s+artistique)\b/],
  ['nature',/\b(histoire\s+naturelle|faune|flore|jardin|jardinage|plantes?|environnement|permaculture|agriculture)\w*\b/],
  ['socialScience',/\b(sciences?\s+(humaines?|sociales?)|sociologie|societe|anthropologie|ethnologie|demographie)\w*\b/],
  ['biology',/\b(sciences?\s+de\s+la\s+vie|sciences?\s+naturelles?|biologie|biologique|genetique|ecologie|zoologie|botanique|anatomie|adn|neurosciences?)\w*\b/],
  ['geography',/\b(geographie|geographique|cartographie|atlas|pays|capitales?|cartes?\s+(?:du|de la|des)\s+monde)\w*\b/],
  ['crafts',/\b(artisanat|artisanal|loisirs?\s+creatifs?|bricolage|travaux?\s+manuels?|couture|tricot)\w*\b/],
  ['literature',/\b(litterature|litteraire|roman|romans|lecture)\w*\b/],
  ['books',/\b(livres?|bibliotheques?|books?)\w*\b/],
  ['politics',/\b(politique|gouvernement|democratie|election|geopolitique|relations?\s+internationales?)\w*\b/],
  ['mathematics',/\b(math|mathematiques?|algebre|geometrie|statistiques?|probabilites?|analyse|modelisation)\w*\b/],
  ['education',/\b(education|pedagogie|enseignement|scolaire|ecole|universite|etudiant|cours|formation)\w*\b/],
  ['poetry',/\b(poesie|poeme|poemes|poetique|ecriture)\w*\b/],
  ['physics',/\b(physique|mecanique|thermodynamique|optique|electromagnetisme|relativite|quantique)\w*\b/],
  ['biochemistry',/\b(biochimie|biochemistry)\w*\b/],
  ['chemistry',/\b(chimie|chimiste|molecules?|chimie\s+organique|chimie\s+minerale|chimie\s+analytique)\w*\b/],
  ['programming',/\b(programmation|programmer|developpement|developpeur|javascript|typescript|python|java|rust|html|css|logiciel|algorithmes?|algorithmique|matlab)\w*\b/],
  ['architecture',/\b(architecture|architecte|batiment|urbanisme|construction|maison)\w*\b/],
  ['psychology',/\b(psychologie|psychologue|psychique|psychanalyse|cognition|comportement)\w*\b/],
  ['security',/\b(securite|cybersecurite|protection|confidentialite|vie\s+privee)\w*\b/],
  ['pets',/\b(animaux|animal|chien|chiens|chat|chats|veterinaire|elevage)\w*\b/],
  ['astronomy',/\b(astronomie|astronomique|espace|planetes?|etoiles|cosmologie|astrophysique)\w*\b/],
  ['religion',/\b(religion|religieux|spiritualite|foi|bible|coran|torah|theologie|culte|priere|islam|musulman|musulmane)\w*\b/],
  ['philosophy',/\b(philosophie|philosophe|philo|ethique|pensee)\w*\b/],
  ['series',/\b(series|serie|saison|episodes?|tv|television|anime)\w*\b/],
  ['cinema',/\b(cinema|film|films|movies?)\w*\b/],
  ['comics',/\b(bd|bandes?\s+dessinee|comics?|manga)\w*\b/],
  ['history',/\b(histoire|historique|archives?|genealogie)\w*\b/],
  ['language',/\b(langues?|francais|anglais|espagnol|allemand|traduction|grammaire|vocabulaire)\w*\b/],
  ['cooking',/\b(cuisine|recette|recettes|gastronomie|patisserie)\w*\b/],
  ['sport',/\b(sport|football|basket|tennis|entrainement|musculation)\w*\b/],
  ['music',/\b(musique|audio|chanson|chansons|album)\w*\b/],
  ['health',/\b(sante|medical|medecine|soin|health|fitness|psychiatrie|nutrition|pharmacologie)\w*\b/],
  ['finance',/\b(finance|budget|banque|compta|argent|facture|economie)\w*\b/],
  ['tech',/\b(informatique|technologie|code|logiciel|numerique|data|ordinateur|reseau)\w*\b/],
  ['science',/\b(science|scientifique|laboratoire|experimentales?)\b/],
  ['art',/\b(arts?|artistique|photo|photographie|design|creation|video|graphisme|dessin|peinture|gravure)\b/],
  ['nature',/\b(nature|jardin|plante|environnement|faune|flore)\w*\b/],
  ['travel',/\b(voyage|travel|vacance|tourisme)\w*\b/],
  ['legal',/\b(droit|juridique|contrat|administratif)\w*\b/],
  ['work',/\b(travail|projet|business|entreprise|professionnel|emploi|wip)\w*\b/],
  ['books',/\b(manuel|encyclopedie|encyclopedies)\w*\b/]
 ];
 const matches=[...new Set(groups.filter(([,pattern])=>pattern.test(text)).map(([key])=>key))];
 return matches.length===1?matches[0]:fallback
}
function iconTint(id){let hash=0;for(const char of String(id||''))hash=(hash*31+char.charCodeAt(0))|0;return `hsl(${Math.abs(hash)%360} 68% 68%)`}
function collectionPhoto(type,name,id){
 const collection=type==='region'?state.regions:type==='shelf'?state.shelves:state.pockets,item=collection.find(value=>value.id===id);
 if(item?.icon_url)return item.icon_url;
 // Les photos personnelles ne sont pas codées en dur : elles restent dans le
 // manifeste local non versionné, adressé par identifiant opaque de collection.
 return id?collectionPhotos[`${type}:${id}`]||'':'';
}
function collectionPhotoClass(type,name,id){
 // Aucune variation de style liée à un nom ou à une photo personnelle.
 return ''
}
function collectionIconFallback(type,name,key){
 return collectionArt[key]||collectionArt.folder
}
function setCollectionIcon(element,type,name,id,color){
 if(!element)return;
 const key=collectionIconKey(type,name,id),photoKey=id?`${type}:${id}`:'',failed=photoKey&&element.dataset.photoFailed===photoKey,photo=failed?'':collectionPhoto(type,name,id);
 const renderKey=photo?`${key}:${photoKey}:${photo}`:key;
 if(element.dataset.collectionIcon===renderKey)return;
 element.dataset.collectionIcon=renderKey;
 element.innerHTML=photo?`<img class="collection-photo${collectionPhotoClass(type,name,id)}" src="${esc(photo)}" alt="" role="button" tabindex="0" aria-label="Agrandir l’icône de ${esc(name)}" title="Cliquer pour agrandir" data-icon-label="${esc(name)}" loading="lazy" decoding="async">`:collectionIconFallback(type,name,key);
 const image=photo&&element.querySelector('.collection-photo');
 if(image)image.addEventListener('error',()=>{element.dataset.photoFailed=photoKey;element.dataset.collectionIcon=key;image.outerHTML=collectionIconFallback(type,name,key)},{once:true});
 if(color){element.style.color=color;element.style.background=`${color}1c`}else{const tint=iconTint(id||name);element.style.color=tint;element.style.background=`color-mix(in srgb, ${tint} 17%, transparent)`}
}
function setSummaryIcon(element,type,name,id){
 if(!element)return;
 const key=collectionIconKey(type,name,id),photoKey=id?`${type}:${id}`:'',failed=photoKey&&element.dataset.photoFailed===photoKey,photo=failed?'':collectionPhoto(type,name,id);
 const renderKey=photo?`${key}:${photoKey}:${photo}`:key;
 if(element.dataset.collectionIcon===renderKey)return;
 element.dataset.collectionIcon=renderKey;
 const tint=iconTint(id||name),detail=element.querySelector('small')?.outerHTML||'';
 element.innerHTML=`<span class="collection-illustration" style="color:${tint}">${photo?`<img class="collection-photo${collectionPhotoClass(type,name,id)}" src="${esc(photo)}" alt="" role="button" tabindex="0" aria-label="Agrandir l’icône de ${esc(name)}" title="Cliquer pour agrandir" data-icon-label="${esc(name)}" loading="lazy" decoding="async">`:collectionIconFallback(type,name,key)}</span> ${esc(name)}${detail}`;
 const image=photo&&element.querySelector('.collection-photo');
 if(image)image.addEventListener('error',()=>{element.dataset.photoFailed=photoKey;element.dataset.collectionIcon=key;image.outerHTML=collectionIconFallback(type,name,key)},{once:true});
}
function decorateCollectionIcons(){
 for(const button of document.querySelectorAll('#region-nav [data-region]')){
  const region=state.regions.find(item=>item.id===button.dataset.region);
  if(region)setCollectionIcon(button.querySelector('.nav-icon'),'region',region.name,region.id,region.color)
 }
 for(const card of document.querySelectorAll('.region-card')){
  const region=state.regions.find(item=>item.id===card.getAttribute('onclick')?.match(/selected='([^']+)'/)?.[1]);
  if(region)setCollectionIcon(card.querySelector('.region-symbol'),'region',region.name,region.id,region.color)
 }
 for(const section of document.querySelectorAll('.summary-region')){
  const region=state.regions.find(item=>item.name===section.querySelector('header h3')?.textContent);
  if(region)setCollectionIcon(section.querySelector('header .region-symbol'),'region',region.name,region.id,region.color)
 }
 for(const panel of document.querySelectorAll('.shelf-panel')){
  const name=panel.querySelector('.shelf-heading h3')?.textContent?.trim();
  const shelfId=panel.querySelector('.shelf-actions [onclick*="renameItem"]')?.getAttribute('onclick')?.match(/renameItem\('shelves','([^']+)'\)/)?.[1];
  const shelf=state.shelves.find(item=>item.id===shelfId);
  if(name)setCollectionIcon(panel.querySelector('.shelf-icon'),'shelf',name,shelf?.id)
 }
 for(const panel of document.querySelectorAll('.pocket-panel:not(.unfiled-pocket)')){
  const title=panel.querySelector('.pocket-title strong')?.textContent;
  const pocketId=panel.querySelector('.pocket-actions [onclick*="renameItem"]')?.getAttribute('onclick')?.match(/renameItem\('pockets','([^']+)'\)/)?.[1];
  const pocket=state.pockets.find(item=>item.id===pocketId);
  if(pocket){const icon=panel.querySelector('.pocket-title>span');if(icon)setCollectionIcon(icon,'pocket',pocket.name,pocket.id)}
 }
 for(const section of document.querySelectorAll('.summary-region')){
  const regionId=section.querySelector('header button[onclick*="selected="]')?.getAttribute('onclick')?.match(/selected='([^']+)'/)?.[1];
  const region=state.regions.find(item=>item.id===regionId);
  const matchedShelfIds=new Set(),shelfByRow=new Map();
  for(const row of section.querySelectorAll('.summary-shelf')){
   const name=row.querySelector('span')?.textContent?.trim().replace(/^[^\p{L}\p{N}]+\s*/u,'');
   const shelf=state.shelves.find(item=>!matchedShelfIds.has(item.id)&&item.region_id===region?.id&&item.name?.trim()===name);
   if(shelf){matchedShelfIds.add(shelf.id);shelfByRow.set(row,shelf)}
   if(name)setSummaryIcon(row.querySelector('span'),'shelf',name,shelf?.id)
  }
  const matchedPocketIds=new Set();
  for(const row of section.querySelectorAll('.summary-pocket')){
   const label=row.childNodes[0]?.textContent?.trim().replace(/^▱\s*/,'');
   let shelfRow=row.previousElementSibling;
   while(shelfRow&&!shelfRow.matches('.summary-shelf'))shelfRow=shelfRow.previousElementSibling;
   const shelf=shelfByRow.get(shelfRow);
   const pocket=state.pockets.find(item=>!matchedPocketIds.has(item.id)&&item.shelf_id===shelf?.id&&item.name===label);
   if(pocket)matchedPocketIds.add(pocket.id);
   if(pocket)setSummaryIcon(row,'pocket',pocket.name,pocket.id)
  }
 }
}
const collectionObserver=new MutationObserver(()=>decorateCollectionIcons());collectionObserver.observe(document.querySelector('#content'),{childList:true,subtree:true});collectionObserver.observe(document.querySelector('#region-nav'),{childList:true,subtree:true});decorateCollectionIcons();
async function api(url,opts={}){try{const r=await fetch(url,opts);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'Une erreur est survenue');return d}catch(err){if(err instanceof TypeError)throw Error('Erreur réseau. Vérifie ta connexion.');throw err}}
async function refresh(){state=await api('/api/state');for(const shelf of state.shelves){if(!knownShelfIds.has(shelf.id)&&!window.matchMedia('(max-width: 700px)').matches)collapsedShelves.add(shelf.id);knownShelfIds.add(shelf.id)}for(const pocket of state.pockets){if(!knownPocketIds.has(pocket.id))collapsedPockets.add(pocket.id);knownPocketIds.add(pocket.id)}searchIndex=state.documents.map(d=>({doc:d,text:`${d.name} ${d.source_path||''}`.toLocaleLowerCase()}));lastUpdated=new Date();render()}
function bytes(n){if(n<1024)return `${n} o`;if(n<1048576)return `${(n/1024).toFixed(0)} Ko`;if(n<1073741824)return `${(n/1048576).toFixed(1)} Mo`;return `${(n/1073741824).toFixed(2)} Go`}
function date(s){try{return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(s.replace(' ','T')+'Z'))}catch{return ''}}
function docsOf(sid){return state.documents.filter(d=>d.shelf_id===sid)}function shelvesOf(rid){return state.shelves.filter(s=>s.region_id===rid)}function pocketsOf(sid){return state.pockets.filter(p=>p.shelf_id===sid)}function docsInPocket(pid){return state.documents.filter(d=>d.pocket_id===pid)}
function logNavigation(action,entity_type,entity_id){api('/api/admin/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,entity_type,entity_id})}).catch(error=>console.warn('Impossible d’enregistrer cette navigation dans le journal LaaS.',error))}
function setLibraryTab(tab){
 currentTab=tab;
 const currentRegion=state.regions.find(r=>r.id===selected);
 if(currentRegion&&(currentRegion.mode||'offline')!==currentTab){selected='all'}
 query='';$('#search').value='';render()
}
function renderNav(){
 const offlineDocs=state.documents.filter(d=>!d.link_url),onlineDocs=state.documents.filter(d=>d.link_url);
 const offlineRegions=state.regions.filter(r=>(r.mode||'offline')==='offline'),onlineRegions=state.regions.filter(r=>(r.mode||'offline')==='online');
 const visibleRegions=currentTab==='online'?onlineRegions:offlineRegions;
 const currentDocCount=currentTab==='online'?onlineDocs.length:offlineDocs.length;
 const tabsMarkup=`<div class="library-mode-tabs" role="tablist"><button type="button" class="mode-tab ${currentTab==='offline'?'active':''}" onclick="setLibraryTab('offline')" role="tab" aria-selected="${currentTab==='offline'}"><span class="mode-dot offline"></span> Hors ligne <span class="mode-count">${offlineDocs.length}</span></button><button type="button" class="mode-tab ${currentTab==='online'?'active':''}" onclick="setLibraryTab('online')" role="tab" aria-selected="${currentTab==='online'}"><span class="mode-dot online"></span> En ligne <span class="mode-count">${onlineDocs.length}</span></button></div>`;
 $('#region-nav').innerHTML=tabsMarkup+`<button class="nav-item ${selected==='all'?'active':''}" data-region="all"><span class="nav-icon">${icons.grid}</span> Vue d’ensemble <span class="nav-count">${currentDocCount}</span></button><button class="nav-item ${selected==='documents'?'active':''}" data-region="documents"><span class="nav-icon">${currentTab==='online'?icons.link:icons.file}</span> ${currentTab==='online'?'Cours &amp; Liens':'Documents'} <span class="nav-count">${currentDocCount}</span></button><button class="nav-item ${selected==='summary'?'active':''}" data-region="summary"><span class="nav-icon">${icons.shelf}</span> Sommaire <span class="nav-count">${state.regions.length}</span></button><button class="nav-item admin-nav ${selected==='admin'?'active':''}" data-region="admin"><span class="nav-icon">✦</span> Administration <span class="nav-count">30 j</span></button>`+visibleRegions.map(r=>`<button class="nav-item ${selected===r.id?'active':''}" data-region="${r.id}"><span class="nav-icon" style="background:${r.color}20;color:${r.color}">${(r.mode||'offline')==='online'?icons.link:icons.folder}</span>${esc(r.name)}<span class="nav-count">${shelvesOf(r.id).length}</span></button>`).join('');
 document.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{const previous=state.regions.find(r=>r.id===selected),next=state.regions.find(r=>r.id===b.dataset.region);if(previous)logNavigation('view_close','region',previous.id);if(next)logNavigation('view_open','region',next.id);selected=b.dataset.region;query='';$('#search').value='';render()})
}
function showMoreSearch(){searchLimit+=60;render()}
function isMp4(d){return d.mime.toLowerCase()==='video/mp4'||d.name.toLowerCase().endsWith('.mp4')}
function isAudio(d){return d.mime.toLowerCase().startsWith('audio/')||/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(d.name)}
function isMedia(d){return isMp4(d)||d.mime.startsWith('video/')||isAudio(d)}
function isImageDoc(d){return d.mime.startsWith('image/')||/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(d.name)}
function canPreview(d){return d.mime==='application/pdf'||/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf)$/i.test(d.name)||isImageDoc(d)}
function fileThumbnail(d){const id=encodeURIComponent(d.id),fallback="(function(img){var p=img.parentElement;img.remove();if(p){p.classList.add('cover-failed');p.textContent='▧'}})(this)";if(d.mime==='application/pdf'||/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf)$/i.test(d.name))return `<img class="file-cover" loading="lazy" decoding="async" src="/api/cover/${id}" alt="Première page de ${esc(d.name)}" onerror="${fallback}">`;if(isImageDoc(d))return `<img class="file-cover photo-thumb" loading="lazy" decoding="async" src="/api/file/${id}?inline=1" alt="${esc(d.name)}" onerror="${fallback}">`;return icons.file}
let previewState={id:null,url:null,total:1,zoom:1};
function fileViewerMarkup(doc,content,quality='Aperçu haute résolution',zoomable=true){
 const extension=doc.name.split('.').pop().toUpperCase(),mime=doc.mime.split('/').pop().toUpperCase();
 const zoom=zoomable?'<div class="file-viewer-zoom"><button type="button" data-viewer-zoom="-1" aria-label="Réduire">−</button><output id="file-viewer-zoom">100 %</output><button type="button" data-viewer-zoom="1" aria-label="Agrandir">＋</button><button type="button" data-viewer-fit>Adapter</button></div>':'';
 return `<div class="laas-file-viewer"><header class="file-viewer-toolbar"><div class="file-viewer-identity"><button class="file-viewer-back" type="button" data-viewer-close aria-label="Fermer l’aperçu">‹</button><div class="file-viewer-file"><span class="file-viewer-kicker">LAAS · APERÇU</span><strong title="${esc(doc.name)}">${esc(doc.name)}</strong><small>${esc(extension||mime)} · ${bytes(doc.size)} · ${esc(quality)}</small></div></div><div class="file-viewer-actions">${zoom}<a class="file-viewer-download" href="/api/file/${encodeURIComponent(doc.id)}" download="${esc(doc.name)}" aria-label="Télécharger le fichier">↓</a><button class="file-viewer-close" type="button" data-viewer-close>Fermer <span>×</span></button></div></header><main class="file-viewer-stage" id="file-viewer-stage">${content}</main></div>`
}
function openFileViewer(doc,content,quality,zoomable=true){
 modal(doc.name,'',fileViewerMarkup(doc,content,quality,zoomable),async()=>{},'Fermer');
 $('#modal-title').textContent=doc.name;
 $('#modal-copy').textContent='';
 previewState={id:doc.id,url:null,total:1,zoom:1};
}
async function loadPreviewDocument(){
 const pages=$('#document-pages');if(!pages||!previewState.id)return;
 try{
  const id=previewState.id,response=await fetch(`/api/cover/${encodeURIComponent(id)}?size=3840&page=1`);
  if(!response.ok)throw Error('Impossible de charger ce document.');
  const blob=await response.blob();if(!$('#modal').open||previewState.id!==id)return;
  previewState.url=URL.createObjectURL(blob);
  const total=Number(response.headers.get('X-Page-Count'))||1;previewState.total=total;
  pages.innerHTML=`<img class="document-page" src="${previewState.url}" alt="Page 1">`+Array.from({length:total-1},(_,i)=>`<img class="document-page" loading="lazy" decoding="async" src="/api/cover/${encodeURIComponent(id)}?size=3840&page=${i+2}" alt="Page ${i+2}">`).join('');
 }catch(error){pages.innerHTML=`<p class="cover-error">${esc(error.message)}</p>`}
}
function previewDoc(id){openDoc(id)}
function setViewerZoom(value){
 previewState.zoom=Math.max(.5,Math.min(3,Math.round(value*100)/100));
 const label=$('#file-viewer-zoom');if(label)label.value=`${Math.round(previewState.zoom*100)} %`;
 document.querySelectorAll('#file-viewer-stage .document-page,#file-viewer-stage .file-viewer-image').forEach(image=>{
  image.style.width=`${previewState.zoom*100}%`;
  image.style.maxWidth=previewState.zoom<=1?'100%':'none';
  image.style.maxHeight=previewState.zoom<=1?'100%':'none';
 })
}
document.addEventListener('click',event=>{
 if(!(event.target instanceof Element))return;
 const close=event.target.closest('[data-viewer-close]');
 if(close){$('#modal').close();return}
 if(event.target.matches('[data-viewer-zoom]')){setViewerZoom(previewState.zoom+Number(event.target.dataset.viewerZoom)*.25);return}
 if(event.target.matches('[data-viewer-fit]'))setViewerZoom(1)
});
function seekMedia(seconds){const media=$('#modal-fields video, #modal-fields audio');if(media)media.currentTime=Math.max(0,Math.min(media.duration||Infinity,media.currentTime+seconds))}
const mediaAudioContexts=new Set();
function volumeBoostControl(){return '<label class="volume-boost"><span>Volume amplifié</span><input class="volume-boost-slider" type="range" min="0" max="200" value="100" aria-label="Volume amplifié jusqu’à 200 %"><output>100 %</output></label>'}
function setupVolumeBoost(){const media=$('#modal-fields video, #modal-fields audio'),slider=$('.volume-boost-slider');if(!media||!slider)return;try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw Error();const context=new AudioContextClass(),gain=context.createGain(),limiter=context.createDynamicsCompressor(),source=context.createMediaElementSource(media);limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.2;source.connect(gain);gain.connect(limiter);limiter.connect(context.destination);mediaAudioContexts.add(context);media._laasGain=gain;media.addEventListener('play',()=>context.resume().catch(()=>{}));slider.addEventListener('input',()=>{const value=Number(slider.value);gain.gain.setTargetAtTime((value/100)**3,context.currentTime,.025);slider.nextElementSibling.value=`${value} %`})}catch{slider.disabled=true;slider.nextElementSibling.value='Indisponible'}}
function mediaControls(){return '<div class="media-skip-controls"><button type="button" onclick="seekMedia(-10)" aria-label="Reculer de 10 secondes">↶ 10 s</button><button type="button" onclick="seekMedia(10)" aria-label="Avancer de 10 secondes">10 s ↷</button></div>'+volumeBoostControl()}
async function prepareVideoPlayer(id){
 try{
  await api(`/api/media/prepare/${encodeURIComponent(id)}`,{method:'POST'});
  while($('#modal').open&&previewState.id===id){
   const job=await api(`/api/media/status/${encodeURIComponent(id)}`);
   if(job.status==='ready'){
    $('#file-viewer-stage').innerHTML=`<div class="file-viewer-media"><video class="laas-media-player" controls playsinline preload="metadata" src="${esc(job.url)}">Ton navigateur ne peut pas lire cette vidéo.</video>${mediaControls()}</div>`;
    setupVolumeBoost();return
   }
   if(job.status==='error')throw Error(job.error||'Impossible de préparer cette vidéo.');
   const progress=$('#media-progress'),label=$('#media-progress-label');
   if(progress)progress.value=job.percent||0;
   if(label)label.textContent=job.percent?`Conversion en cours : ${job.percent} %`:'Analyse du format vidéo…';
   await new Promise(resolve=>setTimeout(resolve,250))
  }
 }catch(error){
  const stage=$('#file-viewer-stage');
  if($('#modal').open&&stage)stage.innerHTML=`<p class="cover-error">${esc(error.message)}</p>`;
  else showToast(error.message,true)
 }
}
function codeHighlight(text,extension){const keywords=/\b(const|let|var|function|return|if|else|for|while|class|new|try|catch|throw|import|from|export|default|async|await|def|self|print|in|not|and|or|True|False|None|true|false|null|undefined|public|private|static|void|int|string|bool|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|JOIN|as|with|yield|lambda|pass|break|continue|switch|case|this|extends|implements|package|echo)\b/;const tokens=/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|'''[\s\S]*?'''|"""[\s\S]*?"""|`(?:\\.|[^`])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[{}()[\].,;:+*/%=!<>?&|~-]/g;let html='',last=0,match;while((match=tokens.exec(text))){html+=esc(text.slice(last,match.index));const value=match[0],cls=/^(\/\/|#|\/\*|'''|""")/.test(value)?'syntax-comment':/^(?:'|"|`)/.test(value)?'syntax-string':/^\d/.test(value)?'syntax-number':keywords.test(value)?'syntax-keyword':/^[{}()[\].,;:+*/%=!<>?&|~-]+$/.test(value)?'syntax-punctuation':'';html+=cls?`<span class="${cls}">${esc(value)}</span>`:esc(value);last=tokens.lastIndex}return html+esc(text.slice(last))}
function markdownHighlight(text,extension){const lines=text.split('\n');let inCode=false,language='',html='';for(const line of lines){const fence=line.match(/^\s*(```+|~~~+)(.*)$/);if(fence){if(!inCode){inCode=true;language=fence[2].trim().split(/\s+/)[0]||'';html+=`<span class="syntax-markdown">${esc(line)}</span>`}else{inCode=false;html+=`<span class="syntax-markdown">${esc(line)}</span>`}html+='\n';continue}if(inCode){html+=codeHighlight(line,language)+'\n';continue}const heading=line.match(/^(\s{0,3}#{1,6}\s+)(.*)$/);if(heading){html+=`<span class="syntax-heading">${esc(heading[1])}${esc(heading[2])}</span>\n`;continue}const marker=line.match(/^(\s*(?:&gt;|>|[-*+]\s|\d+\.\s).*)$/);if(marker){html+=`<span class="syntax-markdown">${esc(line)}</span>\n`;continue}let formatted=esc(line).replace(/(`[^`]+`)/g,'<span class="syntax-string">$1</span>').replace(/(\*\*[^*]+\*\*|__[^_]+__)/g,'<span class="syntax-keyword">$1</span>').replace(/(\[[^\]]+\]\([^)]*\))/g,'<span class="syntax-link">$1</span>');html+=formatted+'\n'}return html}
async function openTextDoc(doc){
 const extension=doc.name.split('.').pop().toLowerCase(),markdown=['md','markdown'].includes(extension);
 openFileViewer(doc,'<pre class="text-file-preview" id="text-file-content"></pre>','Texte lisible',false);
 try{
  const response=await fetch(`/api/file/${encodeURIComponent(doc.id)}?inline=1`);
  if(!response.ok)throw Error('Impossible de lire ce fichier.');
  const length=Number(response.headers.get('Content-Length'))||0;
  if(length>5*1024*1024)throw Error('Ce fichier dépasse 5 Mo. Télécharge-le pour le consulter.');
  const text=await response.text(),target=$('#text-file-content');
  if(target)target.innerHTML=markdown?markdownHighlight(text,extension):codeHighlight(text,extension)
 }catch(error){const stage=$('#file-viewer-stage');if(stage)stage.innerHTML=`<p class="cover-error">${esc(error.message)}</p>`}
}
function openDoc(id){
 const doc=state.documents.find(d=>d.id===id);if(!doc)return;
 if(doc.link_url){window.open(doc.link_url,'_blank','noopener,noreferrer');showToast(`Ouverture du cours : ${doc.name}`);return}
 const extension=doc.name.split('.').pop().toLowerCase();
 const textExtensions=['md','markdown','txt','text','csv','tsv','json','xml','yaml','yml','log','ini','toml','py','js','css','html','htm','sh','sql'];
 const office=['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf'].includes(extension);
 if(doc.mime.startsWith('text/')||textExtensions.includes(extension)){openTextDoc(doc);return}
 if(isMedia(doc)){
  const video=isMp4(doc)||doc.mime.startsWith('video/');
  if(video){
   openFileViewer(doc,'<div class="media-preparing"><progress id="media-progress" max="100" value="0"></progress><span id="media-progress-label">Analyse du format vidéo…</span></div>','Vidéo · qualité source',false);
   prepareVideoPlayer(id)
  }else{
   const mime=doc.mime.toLowerCase().startsWith('audio/')?doc.mime:({'.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.oga':'audio/ogg','.opus':'audio/opus','.wav':'audio/wav','.flac':'audio/flac','.weba':'audio/webm'}[doc.name.match(/\.[^.]+$/)?.[0]?.toLowerCase()]||'application/octet-stream');
   openFileViewer(doc,`<div class="file-viewer-media"><audio class="laas-media-player laas-audio-player" controls preload="metadata"><source src="/api/file/${encodeURIComponent(id)}?inline=1" type="${esc(mime)}">Ton navigateur ne peut pas lire ce fichier audio.</audio>${mediaControls()}</div>`,'Audio · qualité source',false);
   setupVolumeBoost()
  }
  return
 }
 if(isImageDoc(doc)){
  openFileViewer(doc,`<div class="file-viewer-image-wrap"><img class="file-viewer-image" src="/api/file/${encodeURIComponent(id)}?inline=1" alt="${esc(doc.name)}"></div>`,'Image · résolution originale');
  return
 }
 if(doc.mime==='application/pdf'||extension==='pdf'||office){
  openFileViewer(doc,'<div class="document-page-wrap" id="document-pages"><p class="document-loading">Préparation du rendu haute résolution…</p></div>','Rendu haute résolution · jusqu’à 4K');
  loadPreviewDocument();return
 }
 openFileViewer(doc,`<iframe class="file-viewer-frame" src="/api/file/${encodeURIComponent(id)}?inline=1" title="${esc(doc.name)}"></iframe>`,'Aperçu intégré',false)
}
function docRow(d,compact=false){
 let shelf=state.shelves.find(s=>s.id===d.shelf_id),pocket=state.pockets.find(p=>p.id===d.pocket_id),folder=d.source_path?d.source_path.replace(/\\/g,'/').split('/').slice(0,-1).join(' / '):[shelf?.name,pocket?.name].filter(Boolean).join(' / '),openTitle=d.link_url?'Ouvrir le cours MIT':isMedia(d)?'Lire dans le lecteur de Laas':'Ouvrir dans Laas';
 if(d.link_url){
  return `<div class="doc-row ${compact?'compact-row':''}"><div class="doc-main" onclick="openDoc('${d.id}')" style="cursor:pointer"><span class="file-icon" style="background:#548cff1c;color:#60a5fa">${icons.link}</span><div style="min-width:0"><div class="doc-name" title="${esc(d.name)}">${esc(d.name)}</div><div class="doc-meta"><span class="link-badge">MIT OCW</span> · En ligne</div></div></div><div class="doc-folder" title="${esc(folder)}">${esc(folder)}</div><div class="doc-date"><a class="link-row-btn" href="${esc(d.link_url)}" target="_blank" rel="noopener noreferrer">Visiter ↗</a></div><div class="row-actions"><a class="link-row-btn" href="${esc(d.link_url)}" target="_blank" rel="noopener noreferrer" title="Ouvrir le cours">${icons.open}</a><button title="Transférer" aria-label="Transférer ${esc(d.name)}" onclick="transferDoc('${d.id}')">⇢</button><button title="Supprimer" aria-label="Supprimer ${esc(d.name)}" onclick="removeItem('documents','${d.id}')">${icons.trash}</button></div></div>`;
 }
 return `<div class="doc-row ${compact?'compact-row':''}"><div class="doc-main"><span class="file-icon ${canPreview(d)?'has-cover':''}">${fileThumbnail(d)}</span><div style="min-width:0"><div class="doc-name" title="${esc(d.name)}">${esc(d.name)}</div><div class="doc-meta">${bytes(d.size)} · ${esc(d.mime.split('/').pop().toUpperCase())}</div></div></div><div class="doc-folder" title="${esc(folder)}">${esc(folder)}</div><div class="doc-date">${date(d.created_at)}</div><div class="row-actions">${canPreview(d)?`<button title="Ouvrir l’aperçu haute définition" aria-label="Ouvrir l’aperçu haute définition de ${esc(d.name)}" onclick="previewDoc('${d.id}')">◫</button>`:''}<button title="${openTitle}" aria-label="${openTitle} : ${esc(d.name)}" onclick="openDoc('${d.id}')">${icons.open}</button><button title="Télécharger" aria-label="Télécharger ${esc(d.name)}" onclick="location.href='/api/file/${d.id}'">${icons.download}</button><button title="Transférer" aria-label="Transférer ${esc(d.name)}" onclick="transferDoc('${d.id}')">⇢</button><button title="Supprimer" aria-label="Supprimer ${esc(d.name)}" onclick="removeItem('documents','${d.id}')">${icons.trash}</button></div></div>`;
}
function empty(title,copy,button,label){return `<div class="empty-state"><div class="empty-art"><span>✦</span></div><h3>${title}</h3><p>${copy}</p>${button?`<button class="primary-button" onclick="${button}">${label}</button>`:''}</div>`}
function searchField(value,placeholder,attr){return `<label class="level-search"><span>⌕</span><input ${attr} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`}
function renderSummary(){
 let offlineDocs=state.documents.filter(d=>!d.link_url),onlineDocs=state.documents.filter(d=>d.link_url);
 let offlineRegions=state.regions.filter(r=>(r.mode||'offline')==='offline').map(r=>{let shelves=shelvesOf(r.id),docs=shelves.flatMap(s=>docsOf(s.id));return {r,shelves,docs,size:docs.reduce((n,d)=>n+d.size,0)}});
 let onlineRegions=state.regions.filter(r=>(r.mode||'offline')==='online').map(r=>{let shelves=shelvesOf(r.id),docs=shelves.flatMap(s=>docsOf(s.id));return {r,shelves,docs,size:docs.reduce((n,d)=>n+d.size,0)}});
 $('#crumb-current').textContent='Sommaire';
 $('#content').innerHTML=`<div class="hero"><div><div class="eyebrow">Organisation générale</div><h1>Sommaire de la bibliothèque</h1><p>Bibliothèque divisée entre documents hors ligne (stockage local) et cours scientifiques en ligne (MIT).</p></div><button class="secondary-button" onclick="refresh()">↻ Actualiser</button></div><div class="summary-stats"><article><span>Documents locaux</span><strong>${offlineDocs.length.toLocaleString('fr-FR')}</strong></article><article><span>Cours en ligne</span><strong>${onlineDocs.length.toLocaleString('fr-FR')}</strong></article><article><span>Rayons</span><strong>${state.regions.length}</strong></article><article><span>Étagères</span><strong>${state.shelves.length.toLocaleString('fr-FR')}</strong></article></div><div class="summary-split"><div class="summary-split-card"><div class="summary-split-head"><div class="summary-split-title"><h2>Livres &amp; Documents — Hors ligne</h2><span class="summary-split-badge offline">Stockage local SSD</span></div><small>${offlineRegions.length} rayon${offlineRegions.length>1?'s':''} · ${offlineDocs.length.toLocaleString('fr-FR')} fichiers</small></div><div class="summary-list">${offlineRegions.map(({r,shelves,docs,size})=>`<section class="summary-region"><header><span class="region-symbol" style="background:${r.color}1c;color:${r.color}">${icons.folder}</span><div><h3>${esc(r.name)}</h3><small>${shelves.length} étagère${shelves.length===1?'':'s'} · ${docs.length.toLocaleString('fr-FR')} documents · ${bytes(size)}</small></div><button class="outline-button" onclick="setLibraryTab('offline');selected='${r.id}';render()">Ouvrir</button></header>${shelves.map(s=>`<div class="summary-shelf"><span>${icons.shelf} ${esc(s.name)}</span><strong>${docsOf(s.id).length.toLocaleString('fr-FR')} documents</strong><small>${bytes(docsOf(s.id).reduce((n,d)=>n+d.size,0))}</small></div>${pocketsOf(s.id).map(p=>`<div class="summary-pocket">▱ ${esc(p.name)} <small>${docsInPocket(p.id).length} document${docsInPocket(p.id).length===1?'':'s'}</small></div>`).join('')}`).join('')||'<div class="summary-shelf"><span>Aucune étagère</span></div>'}</section>`).join('')}</div></div><div class="summary-split-card"><div class="summary-split-head"><div class="summary-split-title"><h2>Cours &amp; Liens scientifiques — En ligne</h2><span class="summary-split-badge online">Ressources officielles MIT OCW</span></div><small>${onlineRegions.length} rayon${onlineRegions.length>1?'s':''} · ${onlineDocs.length.toLocaleString('fr-FR')} cours &amp; leçons</small></div><div class="summary-list">${onlineRegions.map(({r,shelves,docs})=>`<section class="summary-region"><header><span class="region-symbol" style="background:${r.color}1c;color:${r.color}">${icons.link}</span><div><h3>${esc(r.name)}</h3><small>${shelves.length} département${shelves.length===1?'':'s'} / étagère${shelves.length===1?'':'s'} · ${docs.length.toLocaleString('fr-FR')} cours &amp; leçons</small></div><button class="outline-button" onclick="setLibraryTab('online');selected='${r.id}';render()">Ouvrir</button></header>${shelves.map(s=>`<div class="summary-shelf"><span>${icons.shelf} ${esc(s.name)}</span><strong>${docsOf(s.id).length.toLocaleString('fr-FR')} leçons</strong><small>MIT OCW</small></div>${pocketsOf(s.id).map(p=>`<div class="summary-pocket">▱ ${esc(p.name)} <small>${docsInPocket(p.id).length} cours</small></div>`).join('')}`).join('')||'<div class="summary-shelf"><span>Aucune étagère</span></div>'}</section>`).join('')}</div></div></div>`;
}
function renderDocuments(){
 let docs=state.documents.filter(d=>currentTab==='online'?!!d.link_url:!d.link_url).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 $('#crumb-current').textContent=currentTab==='online'?'Cours en ligne':'Documents';
 $('#content').innerHTML=`<div class="hero"><div><div class="eyebrow">${currentTab==='online'?'Ressources MIT en ligne':'Documents stockés localement'}</div><h1>${currentTab==='online'?'Cours &amp; Leçons en ligne':'Documents hors ligne'}</h1><p>${docs.length.toLocaleString('fr-FR')} ${currentTab==='online'?'cours et liens répertoriés':'fichiers locaux'} · actualisés automatiquement</p></div><button class="secondary-button" onclick="refresh()">↻ Actualiser</button></div><div class="recent-list">${docs.length?docs.map(d=>docRow(d)).join(''):empty('Aucun document','Les éléments apparaîtront ici.',null,'')}</div>`;
}
const auditLabels={login:'Connexion réussie',login_failed:'Échec de connexion',logout:'Déconnexion',account_created:'Accès configuré',console_auth_failed:'Mot de passe console refusé',console_command:'Commande de console',view_open:'Ouverture d’un espace',view_close:'Fermeture d’un espace',document_uploaded:'Fichier ajouté',document_downloaded:'Téléchargement demandé',document_deleted:'Fichier supprimé',document_transferred:'Fichier déplacé',region_created:'Rayon créé',region_renamed:'Rayon renommé',region_deleted:'Rayon supprimé',shelf_created:'Étagère créée',shelf_renamed:'Étagère renommée',shelf_deleted:'Étagère supprimée',pocket_created:'Poche créée',pocket_renamed:'Poche renommée',pocket_deleted:'Poche supprimée',session_revoked:'Session déconnectée'};
function timestamp(value){try{return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value.replace(' ','T')+'Z'))}catch{return value}}
function duration(seconds){let days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);return days?`${days} j ${hours} h`:hours?`${hours} h ${minutes} min`:`${minutes} min`}
function activityChartsMarkup(data){const counts=new Map(data.daily_activity.map(item=>[item.day,Number(item.count)])),today=new Date(),days=Array.from({length:14},(_,index)=>{const day=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-13+index)),key=day.toISOString().slice(0,10);return {key,label:new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'}).format(day),count:counts.get(key)||0}}),maximum=Math.max(1,...days.map(day=>day.count)),peak=Math.max(0,...days.map(day=>day.count)),actions=data.action_activity,labels={...auditLabels},maxAction=Math.max(1,...actions.map(item=>Number(item.count)));return `<section class="admin-charts"><article class="admin-chart-panel"><header><div><span class="eyebrow">Rythme</span><h2>Activité · 14 derniers jours</h2></div><span class="admin-count">${days.reduce((total,day)=>total+day.count,0)} événements</span></header><div class="activity-bars">${days.map(day=>`<div class="activity-bar-col" title="${esc(day.label)} · ${day.count} événements"><span>${day.count||''}</span><i style="height:${Math.max(day.count?6:2,day.count/maximum*100)}%"></i><small>${esc(day.label.split(' ')[0])}</small></div>`).join('')}</div><footer>Pic quotidien : ${peak} événement${peak===1?'':'s'} · fuseau UTC</footer></article><article class="admin-chart-panel"><header><div><span class="eyebrow">Répartition</span><h2>Actions les plus fréquentes</h2></div><span class="admin-count">30 jours</span></header><div class="action-bars">${actions.length?actions.map(item=>`<div class="action-bar-row"><div><span>${esc(labels[item.action]||item.action)}</span><strong>${Number(item.count)}</strong></div><i><b style="width:${Math.max(3,Number(item.count)/maxAction*100)}%"></b></i></div>`).join(''):'<div class="admin-empty">Les graphiques apparaîtront avec les prochaines activités.</div>'}</div><footer>Les ouvertures et fermetures concernent les rayons, étagères et poches consultés.</footer></article></section>`}
const consoleState={node:{type:'root',id:null},directories:[],documents:[],destinations:[],transcript:[]};
function adminConsoleMarkup(){return `<section class="admin-console" id="console"><header class="console-header"><div><span class="eyebrow">Console LaaS · espace documentaire uniquement</span><h2>Explorateur</h2></div><button class="outline-button" id="console-exit" type="button">EXIT</button></header><div class="console-output" id="console-output" aria-live="polite"></div><form class="console-input-row" id="console-form"><span>LAAS <b>›</b></span><input id="console-input" autocomplete="off" spellcheck="false" aria-label="Commande LaaS"><button type="submit">EXÉCUTER</button></form><footer>Navigation et ouverture en lecture seule. Toute suppression ou tout déplacement demande confirmation et le mot de passe du compte. Console limitée à la bibliothèque LaaS.</footer></section><button class="primary-button console-reopen" id="console-reopen" type="button" hidden>Ouvrir la console LaaS</button>`}
function consolePrint(text,kind=''){consolePrintMany([{text,kind}])}
function consoleAppendRows(rows){const output=$('#console-output');if(!output||!rows.length)return;const fragment=document.createDocumentFragment();for(const row of rows){const line=document.createElement('div');line.className=`console-line ${row.kind||''}`;line.textContent=row.text;fragment.append(line)}output.append(fragment);while(output.childElementCount>500)output.firstElementChild.remove();output.scrollTop=output.scrollHeight}
function consolePrintMany(rows){if(!rows.length)return;consoleState.transcript.push(...rows);if(consoleState.transcript.length>500)consoleState.transcript.splice(0,consoleState.transcript.length-500);consoleAppendRows(rows)}
function consoleCurrentName(){const node=consoleState.node;if(node.type==='root')return '/';const collection=node.type==='region'?state.regions:node.type==='shelf'?state.shelves:state.pockets;return `/${collection.find(item=>item.id===node.id)?.name||'?'}`}
function consoleEntries(node){if(node.type==='root')return {directories:state.regions.map(item=>({type:'region',...item})),documents:[]};if(node.type==='region')return {directories:shelvesOf(node.id).map(item=>({type:'shelf',...item})),documents:[]};if(node.type==='shelf')return {directories:pocketsOf(node.id).map(item=>({type:'pocket',...item})),documents:state.documents.filter(item=>item.shelf_id===node.id&&!item.pocket_id)};return {directories:[],documents:state.documents.filter(item=>item.pocket_id===node.id)}}
function consoleLoadEntries(){const entries=consoleEntries(consoleState.node);consoleState.directories=entries.directories;consoleState.documents=entries.documents}
function consoleList(){consoleLoadEntries();const limit=200,rows=[{text:`Emplacement : ${consoleCurrentName()}`,kind:'console-muted'}],directories=consoleState.directories.slice(0,limit),remaining=limit-directories.length,documents=consoleState.documents.slice(0,Math.max(0,remaining));directories.forEach((item,index)=>rows.push({text:`D${index+1}  ${item.name}`,kind:'console-directory'}));documents.forEach((item,index)=>rows.push({text:`F${index+1}  ${item.name}  ·  ${bytes(item.size)}`,kind:'console-tree-file'}));if(!consoleState.directories.length&&!consoleState.documents.length)rows.push({text:'Aucun élément ici.',kind:'console-muted'});if(consoleState.directories.length+consoleState.documents.length>limit)rows.push({text:`Affichage limité à ${limit} éléments pour préserver les performances.` ,kind:'console-muted'});consolePrintMany(rows)}
function consoleLs(){
 consoleLoadEntries();
 const limit=250,directories=consoleState.directories.slice(0,limit),documents=consoleState.documents.slice(0,Math.max(0,limit-directories.length));
 const rows=[{text:`Contenu de ${consoleCurrentName()}`,'kind':'console-muted'},{text:'TYPE       NOM                                                  TAILLE','kind':'console-tree-heading'}];
 directories.forEach((item,index)=>rows.push({kind:'console-tree-folder',text:`DOSSIER    D${index+1}  ${item.name}/`}));
 documents.forEach((item,index)=>rows.push({kind:'console-tree-file',text:`FICHIER    F${index+1}  ${item.name.slice(0,48).padEnd(48,' ')} ${bytes(item.size)}`}));
 if(!directories.length&&!documents.length)rows.push({text:'(dossier vide)','kind':'console-muted'});
 if(consoleState.directories.length+consoleState.documents.length>limit)rows.push({text:`Affichage limité à ${limit} éléments. Entre dans un dossier avec « enter D1 » pour voir son contenu.`,'kind':'console-muted'});
 consolePrintMany(rows);
}
function consoleMoveTo(node){if(consoleState.node.type!=='root'){const action='view_close',type=consoleState.node.type,id=consoleState.node.id;if(['region','shelf','pocket'].includes(type)&&id)logNavigation(action,type,id)}consoleState.node=node;if(node.type!=='root')logNavigation('view_open',node.type,node.id);consoleList()}
function consolePasswordAction(action,payload,label){modal('Confirmer l’action administrateur',`Pour ${label}, confirme le mot de passe de ton compte LaaS. Cette demande vaut uniquement pour cette action.`,'<label class="field-label" for="console-admin-password">Mot de passe actuel</label><input class="field-input" id="console-admin-password" name="password" type="password" autocomplete="current-password" required>',async form=>{await api('/api/admin/console',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action,password:form.get('password')})});state=await api('/api/state');consolePrint(`Action validée : ${label}.`,'console-ok');consoleList()},'Valider',false)}
function runConsoleCommand(input){
 const [command,...args]=input.trim().split(/\s+/);
 if(!command)return;
 consolePrint(`› ${input}`,'console-command');
 if(command==='help'){
  consolePrint('help — affiche cette liste de commandes.','console-manual');
  consolePrint('ls — affiche l’arborescence des dossiers et fichiers.','console-manual');
  consolePrint('inspect — affiche les dossiers et fichiers ici avec leurs numéros.','console-manual');
  consolePrint('enter D1 — ouvre le dossier D1.','console-manual');
  consolePrint('enter .. — remonte au dossier parent.','console-manual');
  consolePrint('destinations — affiche les étagères pour déplacer.','console-manual');
  consolePrint('open F1 — ouvre le fichier F1.','console-manual');
  consolePrint('move F1 S1 — déplace F1 vers l’étagère S1. Mot de passe requis.','console-manual');
  consolePrint('delete F1 — supprime le fichier F1.','console-manual');
  consolePrint('delete D1 — supprime le rayon ou l’étagère D1 et son contenu.','console-manual');
  consolePrint('Toute suppression demande confirmation et le mot de passe du compte.','console-manual');
  consolePrint('exit — ferme la console.','console-manual');
  consolePrint('Repères : D = rayon/étagère · F = fichier · S = étagère.','console-muted');
  return
 }
 if(command==='ls'){consoleLs();return}
 if(command==='inspect'){consoleList();return}
 if(command==='exit'){consoleMoveTo({type:'root',id:null});$('#console').hidden=true;$('#console-reopen').hidden=false;return}
 if(command==='destinations'){
  consoleState.destinations=state.shelves.map(shelf=>({shelf,region:state.regions.find(region=>region.id===shelf.region_id)}));
  consoleState.destinations.forEach((item,index)=>consolePrint(`S${index+1}  ${item.region?.name||'Rayon'} / ${item.shelf.name}`,'console-directory'));
  if(!consoleState.destinations.length)consolePrint('Aucune étagère de destination.','console-muted');
  return
 }
 if(command==='enter'){
  const target=args[0];
  if(target==='..'){
   if(consoleState.node.type==='root'){consolePrint('Tu es déjà à la racine.','console-muted');return}
   if(consoleState.node.type==='pocket'){const pocket=state.pockets.find(item=>item.id===consoleState.node.id);consoleMoveTo({type:'shelf',id:pocket?.shelf_id})}
   else if(consoleState.node.type==='shelf'){const shelf=state.shelves.find(item=>item.id===consoleState.node.id);consoleMoveTo({type:'region',id:shelf?.region_id})}
   else consoleMoveTo({type:'root',id:null});
   return
  }
  const index=Number(target?.replace(/^D/i,''))-1,entry=consoleState.directories[index];
  if(!entry){consolePrint('Dossier inconnu. Utilise inspect pour afficher les choix.','console-error');return}
  consoleMoveTo({type:entry.type,id:entry.id});return
 }
 if(command==='open'){
  const entry=consoleState.documents[Number(args[0]?.replace(/^F/i,''))-1];
  if(!entry){consolePrint('Fichier inconnu. Utilise inspect pour afficher les choix.','console-error');return}
  consolePrint(`Ouverture de ${entry.name}.`,'console-ok');openDoc(entry.id);return
 }
 if(command==='move'){
  const file=consoleState.documents[Number(args[0]?.replace(/^F/i,''))-1],destination=consoleState.destinations[Number(args[1]?.replace(/^S/i,''))-1];
  if(!file||!destination){consolePrint('Usage : move F1 S1. Lance inspect puis destinations pour afficher les choix.','console-error');return}
  if(!confirm(`Déplacer « ${file.name} » vers « ${destination.shelf.name} » ?`))return;
  consolePasswordAction('move',{document_id:file.id,shelf_id:destination.shelf.id},`déplacer « ${file.name} »`);return
 }
 if(command==='delete'){
  const target=args[0]||'',prefix=target[0]?.toUpperCase(),index=Number(target.replace(/^[DF]/i,''))-1;
  if(prefix==='D'){
   const item=consoleState.directories[index];
   if(!item||!['region','shelf'].includes(item.type)){consolePrint('Rayon ou étagère introuvable. Utilise inspect pour afficher les choix.','console-error');return}
   const label=item.type==='region'?'rayon et toutes ses étagères, poches et fichiers':'étagère, ses poches et ses fichiers';
   if(!confirm(`Supprimer définitivement « ${item.name} » et ${label} ?`))return;
   consolePasswordAction('delete_directory',{item_type:item.type,item_id:item.id},`supprimer « ${item.name} » et son contenu`);return
  }
  const file=consoleState.documents[index];
  if(!file){consolePrint('Fichier introuvable. Utilise inspect pour afficher les choix.','console-error');return}
  if(!confirm(`Supprimer définitivement « ${file.name} » de la bibliothèque ?`))return;
  consolePasswordAction('delete',{document_id:file.id},`supprimer « ${file.name} »`);return
 }
 consolePrint('Commande inconnue. Tape help pour afficher les commandes disponibles.','console-error')
}
function initAdminConsole(){const form=$('#console-form');if(!form||form.dataset.ready)return;form.dataset.ready='true';consoleLoadEntries();consoleAppendRows(consoleState.transcript);form.onsubmit=event=>{event.preventDefault();const input=$('#console-input'),command=input.value;input.value='';if(command.trim())api('/api/admin/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'console_command',command:command.trim()})}).catch(error=>console.warn('Impossible d’enregistrer la commande LaaS.',error));runConsoleCommand(command)};$('#console-input').onkeydown=event=>{if(event.ctrlKey&&event.key.toLowerCase()==='c'){event.preventDefault();runConsoleCommand('exit')}};$('#console-exit').onclick=()=>runConsoleCommand('exit');$('#console-reopen').onclick=()=>{$('#console').hidden=false;$('#console-reopen').hidden=true;$('#console-input').focus()}}
async function appendAdminCharts(){if(selected!=='admin'||!$('.admin-storage-card')||$('.admin-charts'))return;try{const data=await api('/api/admin/state');if(selected==='admin'&&$('.admin-storage-card')&&!$('.admin-charts')){$('.admin-storage-card').insertAdjacentHTML('afterend',activityChartsMarkup(data)+adminConsoleMarkup());initAdminConsole()}}catch(error){console.warn('Impossible de charger les graphiques du tableau de bord LaaS.',error)}}
async function renderAdmin(){const root=$('#content');$('#crumb-current').textContent='Administration';root.innerHTML='<div class="admin-loading">Chargement des indicateurs serveur…</div>';try{const data=await api('/api/admin/state');if(selected!=='admin')return;const storage=data.storage,percent=storage.filesystem_total?Math.min(100,storage.filesystem_used/storage.filesystem_total*100):0;const events=data.events.map(event=>`<div class="audit-row"><span class="audit-dot ${event.action==='login_failed'?'warning':''}"></span><div class="audit-main"><strong>${esc(auditLabels[event.action]||event.action)}</strong><small>${esc(event.actor)}${event.target?` · ${esc(event.target)}`:''}</small></div><time>${timestamp(event.created_at)}</time></div>`).join('');const sessions=data.sessions.map(session=>`<div class="session-row"><span class="session-indicator"></span><div class="session-main"><strong>${esc(session.email)}</strong><small>${session.id===data.current_session_id?'Session actuelle':'Connecté depuis'} · ${timestamp(session.created_at)}</small></div>${session.id===data.current_session_id?'<span class="current-session">ICI</span>':`<button class="outline-button" onclick="revokeSession('${esc(session.id)}')">Déconnecter</button>`}</div>`).join('');root.innerHTML=`<div class="hero admin-hero"><div><div class="eyebrow">Centre de contrôle · LaaS</div><h1>Administration</h1><p>État du serveur et activité de la bibliothèque · journaux conservés 30 jours</p></div><button class="secondary-button" onclick="renderAdmin()">↻ Actualiser</button></div><div class="admin-metrics"><article class="admin-metric"><span class="metric-label">Serveur</span><div class="admin-status"><i></i><strong>En ligne</strong></div><small>Actif depuis ${duration(data.server.uptime_seconds)}</small></article><article class="admin-metric"><span class="metric-label">Fichiers</span><strong class="admin-value">${Number(storage.documents).toLocaleString('fr-FR')}</strong><small>${bytes(storage.used)} occupés dans LaaS</small></article><article class="admin-metric"><span class="metric-label">Comptes configurés</span><strong class="admin-value">${storage.users} <span>/ ${storage.allowed_accounts}</span></strong><small>Comptes autorisés</small></article><article class="admin-metric"><span class="metric-label">Accès</span><div class="admin-status"><i></i><strong>${data.access.mode==='private'?'Privé':'Local'}</strong></div><small>${data.access.mode==='private'?esc(data.access.origin||'Passerelle configurée'):'Boucle locale · passerelle privée facultative'}</small></article></div><section class="admin-storage-card"><div class="admin-section-title"><div><span class="eyebrow">Stockage physique</span><h2>État du disque</h2></div><span class="storage-health ${storage.mounted?'':'offline'}"><i></i>${storage.mounted?'Disque accessible':'Disque indisponible'}</span></div><div class="storage-line"><span>Occupé sur le volume</span><strong>${bytes(storage.filesystem_used)} / ${bytes(storage.filesystem_total)}</strong></div><div class="storage-track"><i style="width:${percent.toFixed(1)}%"></i></div><div class="storage-footer"><span>${bytes(storage.filesystem_free)} disponibles</span><span>Base LaaS · ${bytes(storage.database_size)}</span></div></section><div class="admin-columns"><section class="admin-panel"><header class="admin-section-title"><div><span class="eyebrow">Journal d’activité</span><h2>Ce qui se passe</h2></div><span class="admin-count">${data.event_count} événements</span></header><div class="audit-list">${events||'<div class="admin-empty">Aucune activité enregistrée pour le moment.</div>'}</div><footer>Les événements plus anciens que 30 jours sont supprimés automatiquement. Aucun mot de passe ni contenu de document n’est enregistré.</footer></section><section class="admin-panel"><header class="admin-section-title"><div><span class="eyebrow">Accès en cours</span><h2>Sessions actives</h2></div><span class="admin-count">${data.sessions.length}</span></header><div class="session-list">${sessions||'<div class="admin-empty">Aucune session active.</div>'}</div><footer>Déconnecte une session que tu ne reconnais pas. Les sessions disparaissent aussi à l’arrêt du serveur.</footer></section></div>`}catch(error){if(selected==='admin')root.innerHTML=`<div class="admin-error">${esc(error.message)}</div>`}}
async function revokeSession(sessionId){if(!confirm('Déconnecter cette session ?'))return;try{await api('/api/admin/sessions/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId})});showToast('Session déconnectée.');await renderAdmin()}catch(error){showToast(error.message,true)}}
function render(){renderNav();let region=state.regions.find(r=>r.id===selected);$('#crumb-current').textContent=region?region.name:'Vue d’ensemble';if(selected==='admin'){renderAdmin();return}if(selected==='summary'){renderSummary();return}if(selected==='documents'){renderDocuments();return}if(query){let q=query.toLocaleLowerCase(),found=searchIndex.filter(item=>item.text.includes(q)).map(item=>item.doc),shown=found.slice(0,searchLimit),more=found.length-shown.length;$('#content').innerHTML=`<div class="hero"><div><div class="eyebrow">Recherche dans la bibliothèque</div><h1>Résultats</h1><p>${found.length.toLocaleString('fr-FR')} document${found.length===1?'':'s'} pour « ${esc(query)} »</p></div></div><div class="recent-list">${shown.length?shown.map(d=>docRow(d)).join(''):empty('Aucun résultat','Essaie un autre nom ou un dossier.',null,'')}</div>${more?`<div class="search-more"><button type="button" class="outline-button" onclick="showMoreSearch()">Afficher encore ${Math.min(60,more).toLocaleString('fr-FR')} résultats · ${more.toLocaleString('fr-FR')} restants</button></div>`:''}`;return}
 if(region){
  const shelves=shelvesOf(region.id),total=shelves.reduce((n,s)=>n+docsOf(s.id).length,0),rq=regionQuery.toLocaleLowerCase();
  const shelfMarkup=shelves.map(s=>{
   const docs=docsOf(s.id),sq=(shelfQueries[s.id]||'').toLocaleLowerCase();
   const filtered=docs.filter(d=>`${d.name} ${d.source_path||''}`.toLocaleLowerCase().includes(sq)&&(!rq||`${d.name} ${d.source_path||''}`.toLocaleLowerCase().includes(rq)));
   const closed=collapsedShelves.has(s.id);
   const pockets=pocketsOf(s.id), rows=filtered.filter(d=>!d.pocket_id).map(d=>docRow(d,true)).join('');
   const pocketMarkup=pockets.map(p=>{const pocketDocs=filtered.filter(d=>d.pocket_id===p.id),count=docsInPocket(p.id).length,closed=collapsedPockets.has(p.id);return `<section class="pocket-panel ${closed?'is-collapsed':''}"><header><button class="pocket-toggle" aria-expanded="${!closed}" aria-label="${closed?'Déplier':'Replier'} la poche ${esc(p.name)}" onclick="togglePocket('${p.id}')">${closed?'＋':'−'}</button><div class="pocket-title"><span aria-hidden="true">▱</span><strong>${esc(p.name)}</strong><small>${count} document${count===1?'':'s'}</small></div><div class="pocket-actions"><button class="shelf-add" title="Renommer la poche" aria-label="Renommer la poche ${esc(p.name)}" onclick="renameItem('pockets','${p.id}')">✎</button><button class="shelf-add" title="Ajouter des documents dans ${esc(p.name)}" onclick="uploadToPocket('${s.id}','${p.id}')">＋</button><button class="shelf-add" title="Supprimer la poche" onclick="removeItem('pockets','${p.id}')">${icons.trash}</button></div></header>${closed?'':`<div class="pocket-documents">${pocketDocs.length?pocketDocs.map(d=>docRow(d,true)).join(''):count?'<div class="empty-shelf">Aucun fichier ne correspond à la recherche.</div>':'<div class="empty-shelf">Cette poche est vide.</div>'}</div>`}</section>`}).join('');
   const unfiledId=`unfiled:${s.id}`;if(!knownPocketIds.has(unfiledId)){collapsedPockets.add(unfiledId);knownPocketIds.add(unfiledId)}const unfiledClosed=collapsedPockets.has(unfiledId);
   const unfiled=pockets.length?`<section class="pocket-panel unfiled-pocket ${unfiledClosed?'is-collapsed':''}"><header><button class="pocket-toggle" aria-expanded="${!unfiledClosed}" aria-label="${unfiledClosed?'Déplier':'Replier'} les documents sans poche" onclick="togglePocket('${unfiledId}')">${unfiledClosed?'＋':'−'}</button><div class="pocket-title"><strong>Sans poche</strong><small>${filtered.filter(d=>!d.pocket_id).length} document${filtered.filter(d=>!d.pocket_id).length===1?'':'s'}</small></div></header>${unfiledClosed?'':`<div class="pocket-documents">${rows||'<div class="empty-shelf">Aucun document sans poche.</div>'}</div>`}</section>`:filtered.length?filtered.map(d=>docRow(d,true)).join(''):docs.length?'<div class="empty-shelf">Aucun fichier ne correspond à la recherche.</div>':`<div class="empty-shelf">Ton étagère est prête. <button onclick="uploadToShelf('${s.id}')">Ajouter un premier document ↗</button></div>`;
   const content=pockets.length?`${pocketMarkup}${unfiled}`:unfiled;
   return `<section class="shelf-panel ${closed?'is-collapsed':''}"><div class="shelf-head"><button class="shelf-toggle" aria-expanded="${!closed}" aria-label="${closed?'Déplier':'Replier'} l’étagère ${esc(s.name)}" title="${closed?'Déplier':'Replier'} l’étagère" onclick="toggleShelf('${s.id}')"><span aria-hidden="true">${closed?'＋':'−'}</span><span>${closed?'Déplier':'Replier'}</span></button><div class="shelf-heading"><span class="shelf-icon">${icons.shelf}</span><div><h3>${esc(s.name)}</h3><small>${filtered.length}${sq||rq?` sur ${docs.length}`:''} document${filtered.length===1?'':'s'} · ${pockets.length} poche${pockets.length===1?'':'s'}</small></div></div><div class="shelf-actions">${searchField(shelfQueries[s.id]||'','Chercher dans cette étagère…',`data-shelf-search="${s.id}"`)}<button class="shelf-add pocket-create" title="Créer une poche" onclick="newPocket('${s.id}')">＋ Poche</button><button class="shelf-add" title="Renommer l’étagère" aria-label="Renommer l’étagère ${esc(s.name)}" onclick="renameItem('shelves','${s.id}')">✎</button><button class="shelf-add" title="Ajouter un document" onclick="uploadToShelf('${s.id}')">＋</button><button class="shelf-add" title="Supprimer l’étagère" onclick="removeItem('shelves','${s.id}')">${icons.trash}</button></div></div>${closed?'':`<div class="shelf-documents">${content}</div>`}</section>`;
  }).join('');
  $('#content').innerHTML=`<div class="region-toolbar"><button class="back-button" onclick="logNavigation('view_close','region','${region.id}');selected='all';render()">←</button><div><div class="eyebrow">Rayon de la bibliothèque</div><div class="region-title-line"><h1 class="region-title">${esc(region.name)}</h1><button class="rename-button" title="Renommer le rayon" aria-label="Renommer le rayon ${esc(region.name)}" onclick="renameItem('regions','${region.id}')">✎</button></div><p class="region-description">${shelves.length} étagère${shelves.length===1?'':'s'} · ${total.toLocaleString('fr-FR')} document${total===1?'':'s'}</p></div><div class="level-controls">${searchField(regionQuery,'Rechercher dans ce rayon…','data-region-search')}<button class="outline-button" onclick="setAllShelves('${region.id}',true)">Tout plier</button><button class="outline-button" onclick="setAllShelves('${region.id}',false)">Tout déplier</button><button class="outline-button" onclick="newShelf('${region.id}')">＋ Étagère</button><button class="primary-button" onclick="uploadToRegion('${region.id}')">↑ Importer</button></div></div><div class="shelf-list">${shelfMarkup}${!shelves.length?empty('Un rayon prêt à être rempli','Crée des étagères pour organiser les documents de ce domaine.',`newShelf('${region.id}')`,'Créer une étagère'):''}</div>`;
  return;
 }
 let visibleRegions=state.regions.filter(r=>(r.mode||'offline')===currentTab);
 let tabDocs=state.documents.filter(d=>currentTab==='online'?!!d.link_url:!d.link_url);
 let recent=tabDocs.slice(0,6);
 const isOnline=currentTab==='online';
 const heroTitle=isOnline?'Catalogue MIT &amp; Liens scientifiques':'Tout à sa place.';
 const heroSub=isOnline?'Accède directement à toutes les leçons et cursus scientifiques officiels du MIT.':'Une bibliothèque claire pour retrouver chaque document en un instant.';
 const heroAction=isOnline?`<button class="secondary-button" onclick="createRegion()">＋ Nouveau rayon</button><button class="primary-button" onclick="newOnlineLink()">＋ Ajouter un cours</button>`:`<button class="secondary-button" onclick="createRegion()">＋ Nouveau rayon</button><button class="primary-button" onclick="chooseUpload()">↑ Importer un fichier</button>`;
 const welcomeKicker=isOnline?'CURSUS SCIENTIFIQUES MIT OCW':'BONJOUR, BIENVENUE DANS TA BIBLIOTHÈQUE';
 const welcomeH2=isOnline?'Tous les cours du MIT à portée de main.':'De l’espace pour toutes tes idées.';
 const welcomeP=isOnline?'Parcours les 12 départements scientifiques, leurs étagères et leurs leçons pour approfondir tes cours et réviser tes concours.':'Crée des rayons par domaine, ajoute des étagères, puis garde tes documents à portée de main — directement sur ton SSD.';
 const metricLabel=isOnline?'Cours en ligne':'Dans ta bibliothèque';
 const metricCount=tabDocs.length.toLocaleString('fr-FR');
 const metricUnit=isOnline?'cours &amp; leçons':'documents';
 const metricSub=`${visibleRegions.length} rayons · ${visibleRegions.reduce((a,r)=>a+shelvesOf(r.id).length,0).toLocaleString('fr-FR')} étagères${!isOnline?` · ${bytes(state.used)}`:''}`;
 const sectionTitle=isOnline?'Rayons de cours en ligne':'Tes rayons hors ligne';
 $('#content').innerHTML=`<div class="hero"><div><div class="eyebrow">${isOnline?'Espace d’apprentissage en ligne':'Ton espace de connaissance'}</div><h1>${heroTitle}</h1><p>${heroSub}</p></div><div class="hero-actions">${heroAction}</div></div><div class="overview-grid"><div class="welcome-card"><div class="welcome-kicker">${welcomeKicker}</div><h2>${welcomeH2}</h2><p>${welcomeP}</p></div><div class="metric-card"><div class="metric-label">${metricLabel}</div><div class="metric-big"><strong>${metricCount}</strong><span>${metricUnit}</span></div><div class="metric-sub">${metricSub}</div></div></div><div class="section-heading"><h2>${sectionTitle}</h2><span>${visibleRegions.length} espaces organisés</span></div>${visibleRegions.length?`<div class="region-grid">${visibleRegions.map(r=>`<article class="region-card" onclick="selected='${r.id}';render()"><div class="region-card-head"><span class="region-symbol" style="background:${r.color}1c;color:${r.color}">${(r.mode||'offline')==='online'?icons.link:icons.folder}</span><div class="region-actions"><button class="rename-button" title="Renommer le rayon" aria-label="Renommer le rayon ${esc(r.name)}" onclick="event.stopPropagation();renameItem('regions','${r.id}')">✎</button><span class="arrow">↗</span></div></div><h3>${esc(r.name)}</h3><p>${(r.mode||'offline')==='online'?'Cursus et ressources officielles du MIT':'Un espace pour ce qui compte.'}</p><div class="region-meta"><span>${icons.shelf} ${shelvesOf(r.id).length} étagères</span><span>${(r.mode||'offline')==='online'?icons.link:icons.file} ${shelvesOf(r.id).reduce((a,s)=>a+docsOf(s.id).length,0).toLocaleString('fr-FR')} ${(r.mode||'offline')==='online'?'cours':'documents'}</span></div></article>`).join('')}</div>`:empty(isOnline?'Aucun rayon en ligne':'Ta bibliothèque commence ici',isOnline?'Crée ton premier rayon en ligne pour organiser des liens.':'Crée ton premier rayon, puis donne une place à chaque document.',`createRegion()`,'Créer un rayon')}<div class="section-heading"><h2>${isOnline?'Derniers cours consultés / ajoutés':'Ajouts récents'}</h2><span>${tabDocs.length.toLocaleString('fr-FR')} au total</span></div><div class="recent-list">${recent.length?recent.map(d=>docRow(d)).join(''):`<div class="empty-shelf">Aucun élément pour le moment.</div>`}</div>`;
}
function setAllShelves(rid,fold){for(const s of shelvesOf(rid))fold?collapsedShelves.add(s.id):collapsedShelves.delete(s.id);render()}
function toggleShelf(id){const closing=!collapsedShelves.has(id);if(closing)collapsedShelves.add(id);else collapsedShelves.delete(id);logNavigation(closing?'view_close':'view_open','shelf',id);render()}
function togglePocket(id){const closing=!collapsedPockets.has(id);if(closing)collapsedPockets.add(id);else collapsedPockets.delete(id);if(!id.startsWith('unfiled:'))logNavigation(closing?'view_close':'view_open','pocket',id);render()}
function showToast(text,error=false){let t=$('#toast');t.textContent=text;t.className='toast show'+(error?' error':'');setTimeout(()=>t.className='toast',3000)}
function stopModalMedia(){document.querySelectorAll('#modal-fields video, #modal-fields audio').forEach(media=>{media.pause();media.removeAttribute('src');media.querySelectorAll('source').forEach(source=>source.removeAttribute('src'));media.load()});mediaAudioContexts.forEach(context=>context.close().catch(()=>{}));mediaAudioContexts.clear();if(previewState.url){URL.revokeObjectURL(previewState.url);previewState.url=null}previewState.id=null}
$('#modal').addEventListener('close',stopModalMedia);
function modal(title,copy,fields,submit,button='Créer',refreshAfterSubmit=true){let dialog=$('#modal');stopModalMedia();$('#modal-title').textContent=title;$('#modal-copy').textContent=copy;$('#modal-fields').innerHTML=fields;$('#modal-submit').textContent=button;dialog.showModal();$('#modal-form').onsubmit=async e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();try{await submit(new FormData(e.currentTarget));dialog.close();if(refreshAfterSubmit)await refresh()}catch(err){showToast(err.message,true)}}}
$('#modal-fields').addEventListener('change',event=>{if(event.target.matches('[name="clear_icon"]')){$('#field-icon').disabled=event.target.checked;if(event.target.checked)$('#field-icon').value=''}});
function iconUploadFields(item=null){
 const current=item?.icon_url?`<div class="icon-current"><img src="${esc(item.icon_url)}" alt=""><span>Image personnalisée actuelle</span></div>`:'';
 const clear=item?.icon_url?'<label class="icon-reset"><input type="checkbox" name="clear_icon" value="1"> Revenir à l’icône automatique</label>':'';
 return `${current}<label class="field-label" for="field-icon">Image de l’icône (facultative)</label><input class="field-input icon-file-input" id="field-icon" name="icon" type="file" accept="image/jpeg,image/png,image/webp"><div class="helper">${item?.icon_url?'Choisis une autre image, ou coche l’option pour utiliser de nouveau l’icône automatique.':'Tu peux ajouter une image JPG, PNG ou WebP ; sinon l’icône automatique sera utilisée.'}</div>${clear}`
}
function collectionFormData(form,extra={}){
 const data=new FormData();for(const [key,value] of form.entries())data.append(key,value);
 for(const [key,value] of Object.entries(extra))data.append(key,value);
 return data
}
function createRegion(){modal('Créer un rayon',currentTab==='online'?'Crée un rayon pour regrouper des cours ou des liens.':'Choisis un nom simple pour retrouver rapidement ce domaine.','<label class="field-label" for="field-name">Nom du rayon</label><input class="field-input" id="field-name" name="name" placeholder="Ex. MIT Courses, Informatique…" required maxlength="100" autofocus>'+iconUploadFields(),async f=>{let r=await api('/api/regions',{method:'POST',body:collectionFormData(f,{mode:currentTab})});selected=r.id})}
function newOnlineLink(sid=null,pid=null){let shelves=state.shelves.filter(s=>{let r=state.regions.find(reg=>reg.id===s.region_id);return r&&(r.mode||'offline')==='online'});if(!shelves.length){showToast('Crée d’abord un rayon en ligne.',true);return}let opts=shelves.map(s=>{let r=state.regions.find(reg=>reg.id===s.region_id);return `<option value="${s.id}" ${s.id===sid?'selected':''}>${esc(r?.name)} — ${esc(s.name)}</option>`}).join('');modal('Nouveau cours en ligne','Ajoute un lien direct vers un cours, une leçon ou une ressource.',`<label class="field-label" for="link-name">Titre du cours</label><input class="field-input" id="link-name" name="name" placeholder="Ex. 18.06SC — Linear Algebra" required maxlength="120" autofocus><label class="field-label" for="link-url">URL du cours</label><input class="field-input" id="link-url" name="link_url" type="url" placeholder="https://ocw.mit.edu/courses/..." required><label class="field-label" for="link-shelf">Étagère de destination</label><select class="field-input" id="link-shelf" name="shelf_id">${opts}</select>`,async f=>{await api('/api/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shelf_id:f.get('shelf_id'),pocket_id:pid||'',name:f.get('name'),link_url:f.get('link_url')})});showToast('Cours en ligne ajouté.')},'Enregistrer le lien')}
function newShelf(rid){modal('Nouvelle étagère','Chaque étagère peut accueillir autant de documents que tu veux.','<label class="field-label" for="field-name">Nom de l’étagère</label><input class="field-input" id="field-name" name="name" placeholder="Ex. Cours, Contrats, Références…" required maxlength="100" autofocus>'+iconUploadFields(),async f=>{await api('/api/shelves',{method:'POST',body:collectionFormData(f,{region_id:rid})})})}
function newPocket(sid){modal('Nouvelle poche','Crée une poche pour une matière, un cours ou un thème. Par exemple : une poche par EC dans Licence 2.','<label class="field-label" for="field-name">Nom de la poche</label><input class="field-input" id="field-name" name="name" placeholder="Ex. EC : Économie générale" required maxlength="100" autofocus>'+iconUploadFields(),async f=>{await api('/api/pockets',{method:'POST',body:collectionFormData(f,{shelf_id:sid})})})}
function renameItem(type,id){const collection=type==='regions'?state.regions:type==='shelves'?state.shelves:state.pockets,item=collection.find(value=>value.id===id);if(!item)return;const labels={regions:['rayon','du rayon'],shelves:['étagère','de l’étagère'],pockets:['poche','de la poche']},[label,subject]=labels[type];modal(`Modifier ${label}`,`Modifie le nom ou l’image de ${subject}.`,`<label class="field-label" for="field-name">Nom</label><input class="field-input" id="field-name" name="name" value="${esc(item.name)}" required maxlength="100" autofocus>${iconUploadFields(item)}`,async f=>{await api(`/api/${type}/${encodeURIComponent(id)}`,{method:'PATCH',body:collectionFormData(f)});if(type==='regions'&&selected===id)selected=id;showToast(`${label[0].toUpperCase()+label.slice(1)} modifié${type==='regions'?'':'e'}.`)},'Enregistrer')}
async function removeItem(type,id){let label=type==='regions'?'ce rayon et tout son contenu':type==='shelves'?'cette étagère et ses documents':type==='pockets'?'cette poche (ses documents resteront dans l’étagère, sans poche)':'ce document';if(!confirm(`Supprimer ${label} ? Cette action est définitive.`))return;try{await api(`/api/${type}/${id}`,{method:'DELETE'});await refresh();showToast('Élément supprimé.')}catch(e){showToast(e.message,true)}}
async function transferDoc(id){const doc=state.documents.find(d=>d.id===id);if(!doc)return;let destinations=state.shelves.flatMap(s=>{const region=state.regions.find(r=>r.id===s.region_id),base=[region?.name,s.name].filter(Boolean).join(' — '),opts=[{id:'',name:'Sans poche'},...pocketsOf(s.id).map(p=>({id:p.id,name:p.name}))];return opts.filter(o=>s.id!==doc.shelf_id||o.id!==(doc.pocket_id||'')).map(o=>({shelf:s,pocket:o.id,label:`${base} — ${o.name}`}))});if(!destinations.length){showToast('Aucune autre destination disponible.',true);return}const fields=`<label class="field-label" for="field-transfer-shelf">Nouvelle destination pour « ${esc(doc.name)} »</label><select class="field-input" id="field-transfer-shelf" name="destination">${destinations.map((o,i)=>`<option value="${i}">${esc(o.label)}</option>`).join('')}</select>`;modal('Transférer le document','Choisis une étagère et, si besoin, une poche. Le fichier lui-même ne sera pas modifié.',fields,async f=>{const target=destinations[Number(f.get('destination'))];await api(`/api/documents/${encodeURIComponent(id)}/transfer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shelf_id:target.shelf.id,pocket_id:target.pocket.id})});showToast('Document transféré.')},'Transférer')}
let targetShelf=null,targetPocket=null;function chooseUpload(sid=null,pid=null){targetShelf=sid;targetPocket=pid;if(!sid){let shelves=state.shelves;if(!shelves.length){showToast('Crée d’abord un rayon et une étagère.',true);return}if(shelves.length===1)targetShelf=shelves[0].id;else{let opts=shelves.map(s=>`<option value="${s.id}">${esc(state.regions.find(r=>r.id===s.region_id)?.name)} — ${esc(s.name)}</option>`).join('');modal('Où classer tes fichiers ?','Choisis l’étagère où les documents seront enregistrés.',`<label class="field-label" for="field-shelf">Étagère</label><select class="field-input" id="field-shelf" name="shelf_id">${opts}</select>`,async f=>{targetShelf=f.get('shelf_id');$('#file-picker').click() },'Continuer');return}}$('#file-picker').click()}
function uploadToShelf(id){chooseUpload(id)}function uploadToPocket(sid,pid){chooseUpload(sid,pid)}function uploadToRegion(rid){let shelves=shelvesOf(rid);if(!shelves.length){newShelf(rid);return}if(shelves.length===1){chooseUpload(shelves[0].id);return}let opts=shelves.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');modal('Choisir une étagère','Sélectionne la destination des fichiers.',`<label class="field-label">Étagère</label><select class="field-input" name="shelf_id">${opts}</select>`,async f=>{targetShelf=f.get('shelf_id');targetPocket=null;$('#file-picker').click()},'Continuer')}
$('#file-picker').onchange=async e=>{let files=[...e.target.files];e.target.value='';if(!files.length||!targetShelf)return;let form=new FormData();form.append('shelf_id',targetShelf);if(targetPocket)form.append('pocket_id',targetPocket);files.forEach(f=>form.append('files',f));try{await api('/api/upload',{method:'POST',body:form});await refresh();showToast(`${files.length} fichier${files.length>1?'s':''} importé${files.length>1?'s':''} sur le SSD.`)}catch(err){showToast(err.message,true)}};
$('#create-region').onclick=$('#new-region').onclick=createRegion;$('#upload-top').onclick=chooseUpload;$('#search').oninput=e=>{const value=e.target.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=value;searchLimit=60;selected='all';render()},140)};$('#content').addEventListener('input',e=>{if(e.target.matches('[data-region-search]')){regionQuery=e.target.value;let pos=e.target.selectionStart;render();let input=$('[data-region-search]');input?.focus();input?.setSelectionRange(pos,pos)}if(e.target.matches('[data-shelf-search]')){shelfQueries[e.target.dataset.shelfSearch]=e.target.value;let key=e.target.dataset.shelfSearch,pos=e.target.selectionStart;render();let input=document.querySelector(`[data-shelf-search="${key}"]`);input?.focus();input?.setSelectionRange(pos,pos)}});$('#theme-toggle').onclick=()=>{document.documentElement.classList.toggle('light');document.documentElement.style.colorScheme=document.documentElement.classList.contains('light')?'light':'dark'};document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()}if(e.key==='Escape'&&$('#modal').open)$('#modal').close()});
function showCollectionIcon(image){const viewer=$('#collection-icon-viewer'),preview=$('#collection-icon-preview');preview.src=image.currentSrc||image.src;preview.alt=`Icône agrandie de ${image.dataset.iconLabel||'la collection'}`;viewer.showModal()}
document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const image=event.target.closest('.collection-photo');if(!image)return;event.preventDefault();event.stopPropagation();showCollectionIcon(image)},true);
document.addEventListener('keydown',event=>{if(!(event.target instanceof HTMLImageElement)||!event.target.matches('.collection-photo')||!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();showCollectionIcon(event.target)},true);
$('#collection-icon-viewer').addEventListener('click',event=>{if(event.target===$('#collection-icon-viewer'))event.currentTarget.close()});
$('.collection-icon-viewer-close').addEventListener('click',()=>$('#collection-icon-viewer').close());
window.setLibraryTab=setLibraryTab;window.newOnlineLink=newOnlineLink;window.createRegion=createRegion;window.newShelf=newShelf;window.newPocket=newPocket;window.renameItem=renameItem;window.chooseUpload=chooseUpload;window.uploadToShelf=uploadToShelf;window.uploadToPocket=uploadToPocket;window.uploadToRegion=uploadToRegion;window.removeItem=removeItem;window.transferDoc=transferDoc;window.openDoc=openDoc;window.seekMedia=seekMedia;window.previewDoc=previewDoc;window.toggleShelf=toggleShelf;window.togglePocket=togglePocket;window.setAllShelves=setAllShelves;window.refresh=refresh;window.renderAdmin=renderAdmin;window.revokeSession=revokeSession;
new MutationObserver(()=>{if(selected==='admin')appendAdminCharts()}).observe($('#content'),{childList:true});
document.addEventListener('click',event=>{if(!(event.target instanceof Element)||event.target.closest('.collection-photo'))return;const card=event.target.closest('.region-card,.summary-region .outline-button');if(!card)return;const id=card.getAttribute('onclick')?.match(/selected='([a-f0-9]{32})'/)?.[1];if(!id)return;const previous=state.regions.find(region=>region.id===selected);if(previous)logNavigation('view_close','region',previous.id);logNavigation('view_open','region',id)},true);
let authInfo=null,authAction='login';
function authMode(mode=authAction){authAction=mode;let setup=mode==='setup';$('#auth-title').textContent=setup?'Configure ton accès':'Bienvenue';$('#auth-copy').textContent=setup?'Crée un mot de passe Laas pour cette adresse.':'Connecte-toi pour ouvrir ta bibliothèque.';$('#auth-help').textContent=setup?'Choisis au moins 10 caractères.':'Seules les adresses autorisées peuvent se connecter.';$('#auth-help').style.color='';$('#auth-password').autocomplete=setup?'new-password':'current-password';$('#auth-submit').textContent=setup?'Créer mon mot de passe':'Ouvrir ma bibliothèque';$('#auth-mode-toggle').hidden=false;$('#auth-mode-toggle').textContent=setup?'J’ai déjà un compte · Me connecter':'Première connexion ? Créer un accès'}
async function authGate(){authInfo=await api('/api/auth/status');const connected=!!authInfo.user;document.body.classList.toggle('auth-visible',!connected);if(connected){$('#auth-screen').hidden=true;$('#profile-email').textContent=authInfo.user;await refresh();return}$('#auth-screen').hidden=false;$('#auth-email').value='';$('#auth-password').value='';authMode('login')}
$('#auth-mode-toggle').onclick=()=>authMode(authAction==='login'?'setup':'login');
$('#auth-form').onsubmit=async e=>{e.preventDefault();let email=$('#auth-email').value.trim().toLowerCase(),endpoint=authAction==='setup'?'/api/auth/setup':'/api/auth/login';try{await api(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:$('#auth-password').value})});$('#auth-password').value='';await authGate()}catch(err){$('#auth-help').textContent=err.message;$('#auth-help').style.color='#ffaaaa'}};
$('#signout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});await authGate()};
$('#change-password').onclick=()=>modal('Modifier le mot de passe','Vérifie le mot de passe actuel avant d’en choisir un nouveau.','<label class="field-label">Mot de passe actuel</label><input class="field-input" name="old_password" type="password" required><label class="field-label" style="margin-top:14px">Nouveau mot de passe</label><input class="field-input" name="password" type="password" minlength="10" required>',async f=>{await api('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({old_password:f.get('old_password'),password:f.get('password')})});showToast('Mot de passe modifié.')},'Enregistrer');
async function boot(){try{await authGate()}catch(e){$('#content').innerHTML=empty('SSD introuvable','Monte le disque Windows-SSD pour démarrer ta bibliothèque. Aucun document ne sera copié ailleurs.',null,'');showToast(e.message,true)}}boot();setInterval(()=>{if(authInfo?.user&&selected!=='admin')refresh().catch(()=>{})},30000);
