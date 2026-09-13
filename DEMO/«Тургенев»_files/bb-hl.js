var xhintHovered = null;
var xhintHoverWait = false;

function showXHintWaitDone()
{
    xhintHoverWait = false;
    if (xhintHovered) {
        showXHintProcess(xhintHovered);
        xhintHovered = null;
    }
}

function showXHintProcess(span)
{
    var editors = tinymce.editors;

    var xh = document.getElementById('xhint');
    if (xh) {
        xh.innerHTML = '';
        xh.parentNode.classList.remove('inactive');
    }

    editors[0].$('span.xhint-hover').each(function (n, obj) {
                    obj.classList.remove('xhint-hover');
                    return true;
                });
    editors[0].$('span.xhint-active').each(function (n, obj) {
                    obj.classList.remove('xhint-active');
                    return true;
                });

    var legend = document.getElementById('legend');
    var als = legend.getElementsByTagName('TR');
    for(var i=als.length-1; i>=0; i--)
        als[i].className = 'legend-inactive';

    var cl = span.classList;
    currentXHints = [];
    var hchk = {};
    var htchk = {};
    var lastLTR;
    for(var i=0; i<span.classList.length; i++) {
        var s = span.classList[i];
        if (s.match(/^(?:xhint|xhlln)-\d+-\d+/)) {
            var sp = editors[0].$('span.'+s).each(function (n, obj) {
                    obj.classList.add('xhint-hover');
                    obj.classList.add('xhint-active');
                    return true;
                });
            var hk = s.substring(6, s.length);
            if (XHints[hk]) {
                for (var hi=0; hi<XHints[hk].length; hi++) {
                    var h = XHints[hk][hi];
                    if (typeof(h.c) == 'object') {
                        for(var hci=0; hci<h.c.length; hci++) {
                            if (!hchk[h.c[hci]]) {
                                var ho = {t: h.t, c: h.c[hci]};
                                currentXHints.push( ho );
                                hchk[h.c[hci]] = ho;
                                htchk[ h.t+':'+h.c[hci] ] = true;
                            } else if (typeof(hchk[h.c[hci]]) == 'object') {
                                if (!htchk[ h.t+':'+h.c[hci] ]) {
                                    hchk[h.c[hci]].t += ', '+h.t;
                                    htchk[ h.t+':'+h.c[hci] ] = true;
                                }
                            }
                        }
                    } else if (!hchk[h.c]) {
                        currentXHints.push(h);
                        hchk[h.c] = true;
                    }
                }
            }
        } else if (s!='xhl' && s!='xhint') {
            var als = legend.getElementsByClassName(s);
            for(var j=0; j<als.length; j++) {
                var tr = als[j];
                while (tr && tr.tagName!='TR')
                    tr=tr.parentNode;
                if (tr && (!lastLTR || lastLTR.rowIndex<tr.rowIndex))
                    lastLTR = tr;
            }
        }
    }

    if (lastLTR) lastLTR.className='legend-active';
    if (!span.classList.contains('xhint-active')) {
        span.classList.add('xhint-hover');
        span.classList.add('xhint-active');
    }

    showCurrentXHint(0);
}

function showCurrentXHint(n)
{
    var hint = '';

    currentXHintNo = n;

    var pager = document.getElementById('xhint_pager');

    if (pager)
    {
        if (currentXHints.length <= 1) {
            pager.style.display = 'none';
        } else {
            pager.style.display = '';
            document.getElementById('xhpb_info').innerHTML = (currentXHintNo+1) + "/" +currentXHints.length;
            var lbtn = document.getElementById('xhpb_left');
            if (currentXHintNo>0)
                lbtn.classList.remove('inactive');
            else {
                currentXHintNo = 0;
                lbtn.classList.add('inactive');
            }

            var rbtn = document.getElementById('xhpb_right');
            if (currentXHintNo < currentXHints.length-1)
                rbtn.classList.remove('inactive');
            else {
                currentXHintNo = currentXHints.length-1;
                rbtn.classList.add('inactive');
            }
        }
    }

    if (currentXHintNo>=0 && currentXHintNo < currentXHints.length)
    {
        var c = currentXHints[currentXHintNo].c.replace(/\b_([^_]+)_\b/g,"<i>$1</i>");
        var more = '';

        c = c.replace(/&(\w*)(#?\w*)\[([^\[\]]+?)\]\s*/g, function (str, p1, p2, p3) {if (!p1) p1='oshibki_kopirajterov'; more += (more?", ":"")+"<a class='seealso' href='"+location.href.replace(/[\?#].*/,"")+"?h="+p1+p2+"' target='bbhelp' onclick='return windowOpen(this)'>"+p3+"</a>"; return ""});
        c = c.replace(/&(\w*)(#?\w*)\s*$/, function (str, p1, p2) {if (!p1) p1='oshibki_kopirajterov'; return "<a class='goto' href='"+location.href.replace(/[\?#].*/,"")+"?h="+p1+p2+"' target='bbhelp' onclick='return windowOpen(this)'>Подробнее</a>"});

        hint = (currentXHints[currentXHintNo].t? "<b>" + currentXHints[currentXHintNo].t + "</b><br>": "") + c + (more? "<div class='seealso'><span>См. также:</span> "+more+"</div>":"");
    }

    var xh = document.getElementById('xhint');
    if (xh) xh.innerHTML = hint;
}


function showNextXHint()
{
    if (currentXHintNo < currentXHints.length-1)
        showCurrentXHint(currentXHintNo+1);
}

function showPrevXHint()
{
    if (currentXHintNo>0)
        showCurrentXHint(currentXHintNo-1);
}

function showXHint()
{
    if (xhintHoverWait)
        xhintHovered = this;
    else
        showXHintProcess(this);
}

function hideXHint()
{
    xhintHovered = null;

    var editors = tinymce.editors;
    editors[0].$('span.xhint-hover').each(function (n, obj) {
                    obj.classList.remove('xhint-hover');
                    return true;
                });

    if (!xhintHoverWait) {
        xhintHoverWait = true;
        setTimeout(showXHintWaitDone, 500);
    }
}





var stmHoverWait = false;
var stmHovered = null;

function showXDoublesWaitDone()
{
    stmHoverWait = false;
    if (stmHovered) {
        showXDoublesProcess(stmHovered);
        stmHovered = null;
    }
}

function showXDoublesProcess(span)
{
    span.classList.add('stm-hover');

    var sthls = document.getElementById('words_frq_stat');
    if (!sthls) return;

    for(var i=0; i<span.classList.length; i++) {
        var s = span.classList[i];
        if (s.substr(0,4)=='stm-') {
            var sb = sthls.getElementsByClassName(s);
            if (sb.length) {
                higlightByStm(null, sb[0]);
                return;
            }
        }
    }
}

function showXDoubles()
{
    if (stmHoverWait)
        stmHovered = this;
    else
        showXDoublesProcess(this);
}

function hideXDoubles()
{
    stmHovered = null;

    var editors = tinymce.editors;
    editors[0].$('span.stm-hover').each(function (n, obj) {
                    obj.classList.remove('stm-hover');
                    return true;
                });

    if (!stmHoverWait) {
        stmHoverWait = true;
        setTimeout(showXDoublesWaitDone, 500);
    }
}


var prevStmHlBtn = null;
function higlightByStm(e, b)
{
    if (!b) b = this;
    var editors = tinymce.editors;
    if (prevStmHlBtn) {
        for(var i=0; i<prevStmHlBtn.classList.length; i++) {
            var s = prevStmHlBtn.classList[i];
            if (s.substr(0,4)=='stm-') {
                var sp = editors[0].$('span.'+s);
                sp.each(function (n, obj) {
                    obj.classList.remove('stmhl-active');
                    return true;
                });
            }
        }
        prevStmHlBtn.classList.remove('stmhl-active');

        if (e && b==prevStmHlBtn) {
            prevStmHlBtn = null;
            return;
        }
    }

    for(var i=0; i<b.classList.length; i++) {
        var s = b.classList[i];
        if (s.substr(0,4)=='stm-') {
            var sp = editors[0].$('span.'+s);
            sp.each(function (n, obj) {
                obj.classList.add('stmhl-active');
                return true;
            });
        }
    }

    b.classList.add('stmhl-active');
    prevStmHlBtn = b;
}

function doublesSwitch(btn)
{
    var wb = document.getElementById('dblwords_btn');
    var bb = document.getElementById('dblbgrms_btn');
    var wv = document.getElementById('words_frq_stat');
    var bv = document.getElementById('bgrms_frq_stat');

    if (btn.id=="dblbgrms_btn") {
        bb.classList.add('active');
        wb.classList.remove('active');
        wv.style.display='none';
        bv.style.display='';
    } else {
        wb.classList.add('active');
        bb.classList.remove('active');
        bv.style.display='none';
        wv.style.display='';
    }
}

