(function () {
    "use strict";
    var app = document.getElementById("app"), message = document.getElementById("message");
    var records = {}, queue = [], busy = false, timer, noticeUntil=0;
    function showError(text) { message.textContent = text; }
    function send(command) { queue.push(command); pump(); }
    function pump() {
        if (busy || !queue.length) return;
        busy = true;
        var command = queue.shift();
        var script = command.action === "open" ? "NOIR_CEP.open()" : "NOIR_CEP.request(" + JSON.stringify(JSON.stringify(command)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029") + ")";
        window.__adobe_cep__.evalScript(script, function (raw) {
            busy = false;
            try {
                var response = JSON.parse(raw);
                if (response.error) showError(response.error);
                else { if(response.notice){showError(response.notice);noticeUntil=Date.now()+5000;}else if(Date.now()>noticeUntil)showError(""); update(response); }
            } catch (error) { showError("Не удалось связаться с панелью AE: " + String(raw).slice(0, 300)); }
            pump();
        });
    }
    function create(node) {
        var el, input, label;
        if (node.type === "scrollbar") return {el:document.createElement("div"),ignored:true};
        if (node.type === "checkbox" || node.type === "radiobutton") {
            el = document.createElement("label"); input = document.createElement("input");
            // The host owns radio groups, so it also owns their mutual exclusion.
            input.type = node.type === "radiobutton" ? "radio" : "checkbox";
            label = document.createElement("span"); el.appendChild(input); el.appendChild(label);
            input.addEventListener("change", function () { send({action:"click",id:node.id,value:input.checked}); });
        } else if (node.type === "button") {
            el = document.createElement("button"); el.type = "button";
            el.addEventListener("click", function () { send({action:"click",id:node.id}); });
        } else if (node.type === "dropdownlist") {
            el = input = document.createElement("select");
            input.addEventListener("change", function () { send({action:"set",id:node.id,value:input.selectedIndex}); });
        } else if (node.type === "edittext" || node.type === "number") {
            el = input = document.createElement(node.multiline ? "textarea" : "input");
            if (!node.multiline) input.type = node.type === "number" ? "number" : "text";
            var pending;
            function commit() { clearTimeout(pending); send({action:"set",id:node.id,value:input.value}); }
            input.addEventListener("change", commit);
            input.addEventListener("input", function () { clearTimeout(pending); pending = setTimeout(commit, 250); });
        } else if (node.type === "progressbar") {
            el = input = document.createElement("progress"); input.max = 100;
        } else {
            el = document.createElement("div");
            if (node.type === "panel") { label = document.createElement("div"); label.className = "panel-title"; el.appendChild(label); }
        }
        el.className = "node " + node.type;
        if (!node.parent) el.classList.add("root");
        if (node.orientation === "row") el.classList.add("row");
        if (node.orientation === "stack") el.classList.add("stack");
        if (node.scroll) el.classList.add("scroll-body");
        if (node.tabs) el.classList.add("tabs");
        if (node.text === "Создать субтитры" || node.text === "Распознать речь") el.classList.add("primary");
        el.dataset.id = node.id;
        if (node.role) el.dataset.role = node.role;
        var parent = node.parent && records[node.parent] ? records[node.parent].el : app;
        parent.appendChild(el);
        return {el:el,input:input,label:label,id:node.id,role:node.role,meta:node.preview};
    }
    function apply(record, node) {
        if (record.ignored) return;
        var el = record.el, input = record.input;
        el.hidden = record.wordChip ? !node.enabled && node.text === "—" : !node.visible;
        if(record.tile){record.tile.hidden=!node.enabled;record.meta=node.preview;preview(record,node.preview);} el.title = node.tip || "";
        el.classList.toggle("tab-active", node.tabSelected);
        if (input) input.disabled = !node.enabled;
        if (el.tagName === "BUTTON") { el.disabled = !node.enabled; el.textContent = record.shortText || node.text; el.classList.toggle("star", node.text === "☆" || node.text === "★"); }
        else if (record.label) record.label.textContent = node.text;
        else if (node.type === "statictext") el.textContent = node.text;
        if (node.type === "checkbox" || node.type === "radiobutton") input.checked = node.value;
        else if (node.type === "dropdownlist") {
            var items = JSON.stringify(node.items);
            if (record.items !== items) {
                input.textContent = "";
                node.items.forEach(function (text) { var option = document.createElement("option"); option.textContent = text; input.appendChild(option); });
                record.items = items;
            }
            input.selectedIndex = node.selected;
        } else if (node.type === "edittext" || node.type === "number") {
            // Preserve the cursor and in-progress typing when polling background recognition.
            if (document.activeElement !== input) input.value = node.text;
            if (node.type === "number") { input.min = node.min; input.max = node.max; input.step = node.step || "any"; }
        } else if (node.type === "progressbar") input.value = node.value;
    }
    var roles = {};
    function element(tag, cls, text, parent) {
        var el = document.createElement(tag); el.className = cls || "";
        if (text) el.textContent = text;
        if (parent) parent.appendChild(el); return el;
    }
    function place(role, parent, cls) {
        var record = roles[role]; if (!record) return null;
        parent.appendChild(record.el); if (cls) record.el.classList.add(cls); return record;
    }
    function field(role, label, parent) {
        var box = element("div", "field", "", parent); element("div","field-label",label,box); return place(role, box);
    }
    function details(title, parent) {
        var el = element("details","settings-fold","",parent); element("summary","",title,el);
        return element("div","fold-content","",el);
    }
    function sectionTitle(title, subtitle, parent) {
        element("h1","section-title",title,parent); element("p","section-copy",subtitle,parent);
    }
    function compact(role, text, title) {
        var record=roles[role]; if(!record)return;
        record.shortText=text; record.el.textContent=text;record.el.title=title;
    }
    function preview(record, meta) {
        if(!record.tile || !meta)return;
        var video=record.video, reference=meta.id==="noir-red";
        record.hasReference=reference;
        record.tile.classList.toggle("has-reference",reference);
        video.hidden=!reference;
        if(reference && record.source!=="noir") {
            video.src="media/noir.mp4";video.poster="media/noir.jpg";record.source="noir";
        } else if(!reference && record.source) {
            video.pause();video.removeAttribute("src");video.removeAttribute("poster");video.load();record.source=null;
        }
        record.caption.hidden=reference;
        record.caption.textContent=meta.name;
        record.previewLabel.textContent=reference?"РЕФЕРЕНС С СУБТИТРАМИ":"БЕЗ ВИДЕОПРИМЕРА";
        record.caption.style.color="rgb("+meta.base.color.map(function(c){return Math.round(c*255);}).join(",")+")";
        record.caption.style.fontFamily=meta.base.fonts.join(",");
        record.caption.style.textTransform=meta.base.caps?"uppercase":"none";
    }
    function curated() {
        roles={}; Object.keys(records).forEach(function(id){var r=records[id];if(r.role)roles[r.role]=r;});
        app.textContent="";
        var shell=element("div","shell","",app);
        var header=element("header","app-header","",shell),brand=element("div","brand","",header);
        element("span","brand-mark","N",brand);var title=element("div","", "",brand);
        element("div","brand-name","NOIR CAPTIONS",title);element("div","brand-subtitle","LOCAL STUDIO · 0.9",title);
        place("generate",header,"create-action");
        place("status",shell,"workflow-status");
        var nav=element("nav","step-navigation tabs","",shell);
        for(var i=0;i<3;i++)place("tab"+i,nav);
        var moreWrap=element("div","more-wrap","",nav),more=element("button","more-button","Настройки ⌄",moreWrap);
        var menu=element("div","more-menu","",moreWrap);menu.hidden=true;
        more.onclick=function(){menu.hidden=!menu.hidden;};
        for(var a=3;a<9;a++)(function(index){
            var source=roles["tab"+index];if(!source)return;
            var item=element("button","",source.el.textContent,menu);
            item.onclick=function(){
                if(roles.advanced)send({action:"click",id:roles.advanced.id,value:true});
                send({action:"click",id:source.id});menu.hidden=true;
            };
        })(a);
        var body=element("main","scroll-body workspace","",shell);
        var speech=place("speechPage",body,"step-page");speech.el.textContent="";
        sectionTitle("Начнём с вашего видео", "Выделите слой со звуком в After Effects. Распознавание работает на вашем компьютере.",speech.el);
        var inputCard=element("div","surface","",speech.el);
        var recognitionFields=element("div","form-grid","",inputCard);
        field("language","Язык речи",recognitionFields);field("model","Качество распознавания",recognitionFields);
        var actions=element("div","action-row","",inputCard);place("recognize",actions,"primary");place("cancel",actions);
        place("progress",inputCard);
        var recognitionOptions=details("Устройство и словарь",speech.el);
        field("device","Устройство",recognitionOptions);field("prompt","Имена, бренды и термины",recognitionOptions);
        var saved=element("div","secondary-action","",speech.el);element("span","muted","Уже распознали этот ролик?",saved);place("load",saved);
        var text=place("textPage",body,"step-page");text.el.textContent="";
        sectionTitle("Текст, который звучит точно", "Исправьте слова. Нажатие на слово ниже включает или выключает акцент.",text.el);
        var phraseNav=element("div","phrase-navigation","",text.el);
        compact("prevPhrase","←","Предыдущая фраза");compact("nextPhrase","→","Следующая фраза");
        place("prevPhrase",phraseNav);place("phrase",phraseNav);place("nextPhrase",phraseNav);
        place("editor",text.el,"caption-editor");
        var chips=element("div","word-chips","",text.el);
        for(var w=0;w<12;w++){var chip=place("word"+w,chips,"word-chip");if(chip)chip.wordChip=true;}
        var wordNav=element("div","word-pagination","",text.el);place("wordsPrev",wordNav);place("wordsNext",wordNav);
        var textActions=element("div","action-row","",text.el);place("listen",textActions);place("updatePhrase",textActions,"primary");
        var textMore=details("Правки фразы и сохранение",text.el);
        ["seek","lineBreak","phraseBreak","editWord","undoEdit","save","reset"].forEach(function(r){place(r,textMore);});
        var style=place("stylePage",body,"step-page");style.el.textContent="";
        sectionTitle("Один стиль. Ваш характер.","Карточки с видеопримером оживают по наведению. Выберите оформление — композиция останется без изменений.",style.el);
        var filterBar=element("div","filter-row","",style.el);place("favorites",filterBar);
        var grid=element("div","style-grid","",style.el);
        for(var k=0;k<4;k++)(function(index){
            var record=roles["galleryCard"+index];if(!record)return;
            var tile=element("article","style-tile","",grid);record.tile=tile;
            var frame=element("div","preview-frame","",tile);record.video=element("video","", "",frame);
            record.video.muted=true;record.video.loop=true;record.video.playsInline=true;record.video.preload="metadata";
            record.caption=element("div","preview-caption","",frame);
            element("span","","Ваши ",record.caption);element("strong","","слова",record.caption);element("span",""," оживают",record.caption);
            record.previewLabel=element("span","preview-label","ЭСКИЗ СТИЛЯ",frame);
            var info=element("div","tile-info","",tile);place("galleryCard"+index,info);place("galleryStar"+index,info);
            frame.onclick=function(){send({action:"click",id:record.id});};
            tile.onmouseenter=function(){if(!record.hasReference)return;tile.classList.add("playing");var result=record.video.play();if(result&&result.catch)result.catch(function(){});};
            tile.onmouseleave=function(){tile.classList.remove("playing");record.video.pause();};
            preview(record,record.meta);
        })(k);
        var pages=element("div","gallery-pagination","",style.el);place("galleryPrev",pages);place("galleryPage",pages);place("galleryNext",pages);
        element("p","micro-copy","Видеопримеры показывают исходные ролики с субтитрами. Для остальных стилей пока доступны статические карточки.",style.el);
        var quick=element("div","form-grid quick-settings","",style.el);
        field("quickSize","Размер, %",quick);field("quickPosition","Положение",quick);field("intensity","Анимация",quick);
        var typeSettings=details("Шрифт и точная настройка",style.el);
        var targets=element("div","action-row","",typeSettings);place("fontTargetBase",targets);place("fontTargetAccent",targets);
        ["fontSearch","fontFamily","fontStyle","fontPS","recentFonts"].forEach(function(r){place(r,typeSettings);});
        var applyFonts=element("div","action-row","",typeSettings);place("fontSelected",applyFonts);place("fontAll",applyFonts);
        place("savePreset",typeSettings);place("check",typeSettings);
        var cleanup=details("Управление проектом",style.el);
        place("replace",cleanup);
        var clear=element("button","quiet-action","Удалить старые NOIR-превью",cleanup);
        clear.onclick=function(){if(window.confirm("Удалить отдельные композиции NOIR-превью и галерей? Композиции, используемые в монтаже, будут пропущены. Действие можно отменить в AE через Ctrl+Z."))send({action:"removePreviews"});};
        ["viewPage","layoutPage","animationPage","layersPage","toolsPage","sfxPage"].forEach(function(r){place(r,body,"step-page advanced-page");});
        Object.keys(roles).forEach(function(role){var record=roles[role];if(record.wordChip)record.el.hidden=record.el.disabled&&record.el.textContent==="—";});
    }
    function update(data) {
        if (data.full) { app.textContent = ""; records = {}; }
        data.nodes.forEach(function (node) {
            if (!records[node.id]) records[node.id] = create(node);
            apply(records[node.id], node);
        });
        if(data.full)curated();
        if(roles.wordsPrev && roles.wordsNext){var pagination=app.querySelector(".word-pagination");if(pagination)pagination.hidden=roles.wordsPrev.el.disabled && roles.wordsNext.el.disabled;}
        Object.keys(roles).forEach(function(role){var record=roles[role];if(record.tile && record.tile.closest("[hidden]"))record.video.pause();});
    }
    document.body.addEventListener("wheel", function (event) {
        var body = app.querySelector(".scroll-body");
        if (!body || event.ctrlKey) return;
        // Route wheel from ANY part of this panel, including header, fields and lists.
        body.scrollTop += event.deltaY * (event.deltaMode === 1 ? 30 : event.deltaMode === 2 ? body.clientHeight : 1);
        event.preventDefault();
    }, {passive:false});
    if (!window.__adobe_cep__) { showError("Откройте панель через Window → Extensions (Legacy) → NOIR Captions · HTML в After Effects."); return; }
    send({action:"open"});
    timer = setInterval(function () { if (!busy && !queue.length) send({action:"poll"}); }, 750);
    window.addEventListener("unload", function () { clearInterval(timer); });
}());
