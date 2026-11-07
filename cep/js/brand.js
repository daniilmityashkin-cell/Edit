/* NOIR brand: the logo mark and the assistant orb.
   Logo — a black lacquer disc in a polished gold rim; inside, a segmented gold ring (the radial menu, words on a timeline) and
   an «N» whose verticals are chrome and whose diagonal is a gold blade; a gloss passes over the letter now and then.
   Orb — a black glass sphere in a turning gold rim, with molten amber light moving inside and a glass highlight on top.
   Both are drawn with gradients only (no blur filters): cheap for the browser inside After Effects. */
(function () {
    "use strict";
    var NS = "http://www.w3.org/2000/svg", uid = 0;

    function logo(cls) {
        var u = "nx" + (++uid), C = 2 * Math.PI * 24.5, seg = C / 8, gap = 3.4, rot = -90 + (gap / C) * 180;
        var s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 64 64"); s.setAttribute("class", "nx-logo" + (cls ? " " + cls : "")); s.setAttribute("aria-hidden", "true");
        s.innerHTML =
            "<defs>" +
            "<linearGradient id='" + u + "g' x1='8' y1='6' x2='56' y2='58' gradientUnits='userSpaceOnUse'>" +
                "<stop offset='0' stop-color='#fff3cc'/><stop offset='.24' stop-color='#ecc46a'/><stop offset='.5' stop-color='#a8772a'/>" +
                "<stop offset='.62' stop-color='#6e4b14'/><stop offset='.8' stop-color='#e1b45c'/><stop offset='1' stop-color='#fff1c6'/></linearGradient>" +
            "<linearGradient id='" + u + "s' x1='0' y1='20' x2='0' y2='44' gradientUnits='userSpaceOnUse'>" +
                "<stop offset='0' stop-color='#ffffff'/><stop offset='.46' stop-color='#d9d3c7'/><stop offset='.54' stop-color='#857e72'/><stop offset='1' stop-color='#ece7dc'/></linearGradient>" +
            "<radialGradient id='" + u + "d' cx='.36' cy='.3' r='.78'><stop offset='0' stop-color='#2e2921'/><stop offset='.55' stop-color='#0e0d0b'/><stop offset='1' stop-color='#040403'/></radialGradient>" +
            "<linearGradient id='" + u + "h' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='.95'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>" +
            "<clipPath id='" + u + "c'><path d='M22 21h4.4v22H22zM37.6 21H42v22h-4.4zM22 21h4.6L42 43h-4.6z'/></clipPath>" +
            "</defs>" +
            "<circle cx='32' cy='32' r='31' fill='url(#" + u + "d)'/>" +
            "<circle cx='32' cy='32' r='30.3' fill='none' stroke='url(#" + u + "g)' stroke-width='1.3'/>" +
            "<circle cx='32' cy='32' r='24.5' fill='none' stroke='url(#" + u + "g)' stroke-width='2.6' stroke-dasharray='" + (seg - gap).toFixed(2) + " " + gap + "' transform='rotate(" + rot.toFixed(2) + " 32 32)'/>" +
            "<path d='M22 21h4.4v22H22zM37.6 21H42v22h-4.4z' fill='url(#" + u + "s)'/>" +
            "<path d='M22 21h4.6L42 43h-4.6z' fill='url(#" + u + "g)'/>" +
            "<g clip-path='url(#" + u + "c)'><rect class='nx-sheen' x='-12' y='14' width='9' height='36' fill='url(#" + u + "h)' transform='skewX(-18)'/></g>" +
            "<path d='M7.6 17.4 A28.4 28.4 0 0 1 46.2 7.4' fill='none' stroke='#fff' stroke-opacity='.3' stroke-width='.8' stroke-linecap='round'/>";
        return s;
    }

    function orb(cls) {
        var o = document.createElement("span"); o.className = "nx-orb" + (cls ? " " + cls : ""); o.setAttribute("aria-hidden", "true");
        o.innerHTML = "<i class='nx-halo'></i><i class='nx-rim'></i><i class='nx-core'><i class='nx-glow nx-a'></i><i class='nx-glow nx-b'></i><i class='nx-sweep'></i></i><i class='nx-gloss'></i>";
        return o;
    }

    window.NoirBrand = { logo: logo, orb: orb };
})();
