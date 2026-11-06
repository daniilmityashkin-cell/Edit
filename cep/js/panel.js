(function () {
    "use strict";
    var app = document.getElementById("app"), message = document.getElementById("message");
    var records = {}, queue = [], busy = false, timer, noticeTimer, successTimer, noticeUntil=0;
    var editableInputs=[], videoRecords=[], previewObserver=null;
    function showError(text, duration) {
        clearTimeout(noticeTimer);
        if(message.textContent!==text)message.textContent=text;
        noticeUntil=duration ? Date.now()+duration : 0;
        if(text && duration)noticeTimer=setTimeout(function(){noticeUntil=0;message.textContent="";},duration);
    }
    function enqueue(command) {
        var last=queue[queue.length-1];
        // Collapse only adjacent value updates; never move edits across an AE action.
        if(last && command.action==="set" && last.action==="set" && command.id===last.id)queue[queue.length-1]=command;
        else if(last && command.action==="selectTextPhrase" && last.action===command.action)queue[queue.length-1]=command;
        else queue.push(command);
    }
    function flushInputs() { editableInputs.forEach(function(el){el._flush();}); }
    function schedulePoll() {
        clearTimeout(timer);
        if(document.hidden || !workflow.recognizing)return;
        timer=setTimeout(function(){if(!busy && !queue.length)send({action:"poll"});else schedulePoll();},1000);
    }
    function send(command) {
        if (command.action !== "set" && command.action !== "poll" && command.action !== "open") {
            flushInputs();
        }
        enqueue(command); pump();
    }
    function pump() {
        if (busy || !queue.length) return;
        busy = true;
        var command = queue.shift();
        var script = command.action === "open" ? "NOIR_CEP.open()" : "NOIR_CEP.request(" + JSON.stringify(JSON.stringify(command)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029") + ")";
        window.__adobe_cep__.evalScript(script, function (raw) {
            busy = false;
            try {
                var response = JSON.parse(raw);
                if (response.error) showError(response.error,8000);
                else { if(response.notice){showError(response.notice,5000);}else if(Date.now()>noticeUntil)showError(""); update(response); }
            } catch (error) { showError("Не удалось связаться с панелью AE: " + String(raw).slice(0, 300),8000); }
            schedulePoll();pump();
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
            var pending, dirty=false;
            function flush() { clearTimeout(pending); if(dirty){dirty=false;enqueue({action:"set",id:node.id,value:input.value});} }
            function commit() { flush(); pump(); }
            el._flush=flush;editableInputs.push(el);
            input.addEventListener("change", commit);
            input.addEventListener("input", function () { dirty=true; clearTimeout(pending); pending = setTimeout(commit, 250); });
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
        record.node=node;
        var el = record.el, input = record.input;
        el.hidden = record.wordChip ? !node.enabled && node.text === "—" : !node.visible;
        if(record.tile){record.tile.hidden=!node.enabled;record.meta=node.preview;record.frame.setAttribute("aria-label","Выбрать стиль "+(node.preview?node.preview.name:""));preview(record,node.preview);} el.title = node.tip || "";
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
    var MAIN_PAGES = ["speechPage","textPage","stylePage","finishPage"];
    var roles = {}, workflow = {}, ui = {main:0, settings:false, section:"recognition", completed:0, successUntil:0}, view = {};
    function element(tag, cls, text, parent) {
        var el = document.createElement(tag); el.className = cls || "";
        if (text) el.textContent = text;
        if (parent) parent.appendChild(el); return el;
    }
    function button(text, cls, parent, action) {
        var el = element("button",cls,text,parent); el.type="button"; el.onclick=action; return el;
    }
    function place(role, parent, cls) {
        var record=roles[role]; if(!record)return null;
        parent.appendChild(record.el); if(cls)record.el.classList.add(cls); return record;
    }
    function field(role, label, parent) {
        if(!roles[role])return null;
        var box=element("label","field","",parent); box.dataset.field=role;
        element("span","field-label",label,box); place(role,box); return box;
    }
    function details(title,parent) {
        var el=element("details","settings-fold","",parent);element("summary","",title,el);
        return element("div","fold-content","",el);
    }
    function sectionTitle(title,subtitle,parent) {
        element("h1","section-title",title,parent);element("p","section-copy",subtitle,parent);
    }
    function action(role) { if(roles[role])send({action:"click",id:roles[role].id}); }
    function compact(role,text,title) {
        if(!roles[role])return;var r=roles[role];r.shortText=text;r.el.textContent=text;r.el.setAttribute("aria-label",title);r.el.title=title;
    }
    function stopVideos(except) {
        videoRecords.forEach(function(r){if(r!==except){if(!r.video.paused)r.video.pause();r.tile.classList.remove("playing");}});
    }
    function playPreview(record) {
        stopVideos(record);
        if(!record.hasReference || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
        record.tile.classList.add("playing");var play=record.video.play();if(play && play.catch)play.catch(function(){record.tile.classList.remove("playing");});
    }
    function preview(record,meta) {
        if(!record.tile || !meta)return;
        var video=record.video,reference=meta.id==="noir-red";
        record.hasReference=reference;record.tile.classList.toggle("has-reference",reference);video.hidden=!reference;
        if(reference && record.source!=="noir") {video.src="media/noir.mp4";video.poster="media/noir.jpg";record.source="noir";}
        else if(!reference && record.source){video.pause();video.removeAttribute("src");video.removeAttribute("poster");video.load();record.source=null;}
        var names={"mix-colors":"Mix Colors","editorial-italic":"Editorial Italic","kinetic-stack":"Kinetic Blue","noir-red":"NOIR Red","editorial":"Editorial","pop-words":"Pop Words","kinetic-orange":"Kinetic Orange","invert":"Invert","reels-glow":"Reels Glow","gold-serif":"Gold Serif","silver-italic":"Silver Italic","aukera-future":"Aukera Future","onder-wide":"Onder Wide","abraxas-sci":"Abraxas Sci-Fi","pixel-vpch2":"Pixel VPCH2","elastre-thin":"Elastre Thin","dispater-gold":"Dispater Gold","belcanto-cream":"Belcanto Cream","peter-ornate":"Peter Ornate"};
        var name=names[meta.id] || meta.name;
        record.caption.hidden=reference;record.caption.textContent=name;
        record.shortText=name;record.el.textContent=name;
        record.frame.setAttribute("aria-label","Выбрать стиль "+name);
        record.frame.setAttribute("aria-pressed",String(meta.id===workflow.preset));
        record.previewLabel.textContent=reference?"ВИДЕО · 3 СЕК":"СТИЛЬ";
        record.caption.style.color="rgb("+meta.base.color.map(function(c){return Math.round(c*255);}).join(",")+")";
        record.caption.style.fontFamily=meta.base.fonts.join(",");
        record.caption.style.textTransform=meta.base.caps?"uppercase":"none";
        record.tile.classList.toggle("selected",meta.id===workflow.preset);
    }
    function selectMain(index) {
        ui.main=index;view.body.scrollTop=0;view.tools.hidden=true;stopVideos();
        flushInputs();pump();
        renderLayout();
    }
    function openSettings(section) {
        ui.settings=true;ui.section=section || ui.section;view.settingsSelect.value=ui.section;
        view.settingsBody.scrollTop=0;stopVideos();renderLayout();view.close.focus();
    }
    function closeSettings() {ui.settings=false;renderLayout();view.more.focus();}
    function renderLayout() {
        if(!view.body)return;
        MAIN_PAGES.forEach(function(role,index){if(roles[role])roles[role].el.hidden=ui.main!==index;});
        if(view.stepName)view.stepName.textContent=["Видео","Текст","Стиль","Правка"][ui.main]+" · "+(ui.main+1)+"/4";
        if(view.heading)view.heading.textContent=["Ваше видео","Редактор текста","Галерея стилей","Правка субтитров"][ui.main];
        view.tabs.forEach(function(tab,index){tab.classList.toggle("tab-active",ui.main===index);tab.setAttribute("aria-selected",ui.main===index?"true":"false");});
        view.shell.classList.toggle("settings-open",ui.settings);view.drawer.hidden=!ui.settings;view.backdrop.hidden=!ui.settings;
        view.more.setAttribute("aria-expanded",String(ui.settings));
        Object.keys(view.sections).forEach(function(key){view.sections[key].hidden=key!==ui.section;});
        view.drawer.setAttribute("aria-modal",String(window.innerWidth<760));
        view.body.setAttribute("aria-hidden",String(ui.settings && window.innerWidth<760));
        view.primary.textContent=workflow.recognizing?"Распознавание…":ui.main===0 || !workflow.hasData?"Распознать речь":workflow.canUpdate?"Обновить фразу":"Создать субтитры";
        view.primary.disabled=!!workflow.recognizing;
        view.all.hidden=!workflow.canUpdate || ui.main===0;
        view.status.textContent=workflow.recognizing?"Распознавание":workflow.pending?"Есть замечания перед созданием":!workflow.hasData?"Выберите слой со звуком в AE":workflow.dirty?"Текст изменён — обновите фразу":"Можно редактировать";
        view.status.dataset.state=workflow.recognizing?"busy":workflow.dirty || workflow.pending?"dirty":workflow.hasData?"ready":"idle";
        if(Date.now()<ui.successUntil && !workflow.dirty && !workflow.pending)view.status.textContent="✓ Субтитры обновлены";
        view.status.title=roles.status && roles.status.node?roles.status.node.tip:"";
        view.progress.hidden=!workflow.recognizing;
        roles.cancel.el.hidden=!workflow.recognizing;
        view.phraseCount.textContent=workflow.count?"Фраза "+(workflow.phrase+1)+" из "+workflow.count:"Загрузите или распознайте речь";
        view.empty.hidden=!!workflow.hasData;view.editorArea.hidden=!workflow.hasData;
        videoRecords.forEach(function(r){r.tile.classList.toggle("selected",!!r.meta && r.meta.id===workflow.preset);r.frame.setAttribute("aria-pressed",String(!!r.meta && r.meta.id===workflow.preset));if((ui.main!==2 || r.tile.hidden) && !r.video.paused)r.video.pause();});
        renderIssues();
    }
    function issueTarget(issue) {
        if(issue.code==="font" || issue.code==="font_unknown")return {section:"font",field:roles.fontFamily?"fontFamily":"fontPS",label:"Выбрать шрифт"};
        if(issue.code==="safe_area")return {main:2,field:"quickPosition",label:"Настроить положение"};
        return {main:1,field:"editor",label:"Открыть фразу"};
    }
    function goToIssue(issue) {
        var target=issueTarget(issue);
        if(target.section){
            if(issue.target)send({action:"click",id:roles[issue.target==="accent"?"fontTargetAccent":"fontTargetBase"].id,value:true});
            openSettings(target.section);
        }
        else {ui.settings=false;selectMain(target.main);}
        if(issue.segment!==undefined && roles.phrase)send({action:"set",id:roles.phrase.id,value:issue.segment});
        var r=roles[target.field];if(r){r.el.scrollIntoView({block:"center"});r.el.focus();}
    }
    function renderIssues() {
        var issues=workflow.issues || [], signature=JSON.stringify(issues);
        view.issues.hidden=!issues.length;
        if(view.issueSignature===signature)return;view.issueSignature=signature;
        view.issueList.textContent="";
        Array.prototype.forEach.call(app.querySelectorAll(".field-issue"),function(el){el.remove();});
        issues.forEach(function(issue){
            var row=element("div","issue-row","",view.issueList);element("span","",issue.message,row);
            button(issueTarget(issue).label,"text-button",row,function(){goToIssue(issue);});
            var target=issueTarget(issue),container=app.querySelector('[data-field="'+target.field+'"]');
            if(container)element("span","field-issue",issue.message,container);
        });
    }
    function showWordTools() {
        var editor=roles.editor.input,start=editor.selectionStart,end=editor.selectionEnd;
        view.selection={start:start,end:end,text:editor.value};
        var line=editor.value.substring(0,start).split("\n").length-1;
        if(line<workflow.count && view.caretPhrase!==line){view.caretPhrase=line;send({action:"selectTextPhrase",index:line});}
        view.tools.hidden=!workflow.hasData || start===end || editor.value.substring(start,end).indexOf("\n")!==-1;
        view.toolsLabel.textContent="Выделено: "+editor.value.substring(start,end).slice(0,38);
        view.wordMenu.disabled=!workflow.hasData;
        // A caret is also usable from the explicit menu; highlighting is only needed for the floating toolbar.
        view.wordMenu.title="Действия со словом под курсором, строка "+(line+1);
    }
    function editSelected(kind) {
        var selection=view.selection;if(!selection)return;
        send({action:"wordEdit",kind:kind,text:selection.text,start:selection.start,end:selection.end});
        view.tools.hidden=true;view.wordDetails.open=false;
        roles.editor.input.blur();
    }
    function curated() {
        roles={};Object.keys(records).forEach(function(id){var r=records[id];if(r.role)roles[r.role]=r;});
        if(previewObserver)previewObserver.disconnect();
        app.textContent="";view={};view.sections={};view.tabs=[];videoRecords=[];
        view.shell=element("div","shell","",app);
        var sidebar=element("aside","sidebar","",view.shell),brand=element("div","brand","",sidebar);
        var stage=element("div","stage","",view.shell),header=element("header","app-header","",stage);
        var introduction=element("div","introduction","",header);
        view.heading=element("h1","workspace-heading","Ваше видео",introduction);
        var mark=element("span","brand-mark","",brand);
        var logo=element("img","","",mark);logo.src="media/noir-mark.svg";logo.alt="";mark.setAttribute("aria-hidden","true");
        brand.title="NOIR Captions · 0.16.2";brand.setAttribute("aria-label","NOIR Captions");
        var primaryArea=element("div","primary-area","",header);
        view.primary=button("Распознать речь","create-action",primaryArea,function(){
            action(ui.main===0 || !workflow.hasData?"recognize":workflow.canUpdate?"updatePhrase":"generate");
        });
        view.all=element("details","action-menu","",primaryArea);element("summary","","⋯",view.all).setAttribute("aria-label","Другие действия создания");
        var allMenu=element("div","popover","",view.all);
        button("Обновить все фразы","",allMenu,function(){view.all.open=false;action("generate");});
        var statusRow=element("div","status-row","",stage);
        view.status=element("div","workflow-status","",statusRow);view.status.setAttribute("role","status");view.status.setAttribute("aria-live","polite");
        place("cancel",statusRow,"text-button");
        view.progress=element("div","recognition-progress","",stage);place("progress",view.progress);
        var nav=element("nav","step-navigation tabs dial","",sidebar);nav.setAttribute("aria-label","Основные разделы");nav.setAttribute("role","tablist");
        ["Видео","Текст","Стиль","Правка"].forEach(function(name,index){
            var tab=button("","step-tab",nav,function(){selectMain(index);});
            var icon=element("span","nav-icon","",tab);icon.setAttribute("aria-hidden","true");
            var paths=["M4 5h12v14H4z M16 9l5-3v12l-5-3", "M4 5h16 M12 5v15 M8 20h8", "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h4", "M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4"];
            icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[index]+'"/></svg>';
            element("span","nav-label",name,tab);
            tab.setAttribute("role","tab");tab.setAttribute("aria-controls",MAIN_PAGES[index]);
            tab.onkeydown=function(event){if(event.key==="ArrowRight" || event.key==="ArrowLeft"){event.preventDefault();var count=view.tabs.length,next=(index+(event.key==="ArrowRight"?1:count-1))%count;selectMain(next);view.tabs[next].focus();}};
            view.tabs.push(tab);
        });
        mark.classList.add("dial-core");nav.appendChild(mark);
        if(window.NoirWheel)NoirWheel.init({hub:mark,roles:function(){return roles;},
            click:function(role){if(roles[role])send({action:"click",id:roles[role].id});},
            run:function(command){send({action:"run",command:command});},
            page:function(index){ui.settings=false;selectMain(index);},
            settings:function(section){openSettings(section);},
            notify:function(text,time){showError(text,time);}});
        var dialFoot=element("div","dial-foot","",sidebar);
        view.stepName=element("div","step-name","",dialFoot);view.stepName.setAttribute("aria-hidden","true");
        view.more=button("Настройки","more-button",dialFoot,function(){if(ui.settings)closeSettings();else openSettings();});
        view.more.setAttribute("aria-controls","settings-drawer");view.more.setAttribute("aria-label","Настройки");
        var settingsIcon=element("span","nav-icon","");settingsIcon.setAttribute("aria-hidden","true");
        settingsIcon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m9 3-.7 2.6-2.6.7L4 8.7l1.8 2L5 13.4l-1 1 1.8 3.1 2.5-.5 1.8 2H13l1.8-2 2.5.5 1.8-3.1-1.7-2.2.6-2.6-1.8-3.1-2.6.1L12 3H9Z"/><circle cx="11.5" cy="11.4" r="3"/></svg>';
        view.more.insertBefore(settingsIcon,view.more.firstChild);
        var workspace=element("div","workspace-layout","",stage);
        view.body=element("main","scroll-body workspace","",workspace);
        if(window.IntersectionObserver)previewObserver=new IntersectionObserver(function(entries){
            entries.forEach(function(entry){if(!entry.isIntersecting){var r=entry.target._previewRecord;if(r && !r.video.paused){r.video.pause();r.tile.classList.remove("playing");}}});
        },{root:view.body});
        view.issues=element("section","preflight","",view.body);view.issues.hidden=true;
        element("div","eyebrow","ПЕРЕД СОЗДАНИЕМ",view.issues);
        view.issueList=element("div","issue-list","",view.issues);
        element("p","micro-copy","Безопасная область оценивается приблизительно. Проверьте результат в композиции.",view.issues);
        button("Продолжить с замечаниями","quiet-action",view.issues,function(){send({action:"continueGeneration"});});
        var speech=place("speechPage",view.body,"step-page");speech.el.textContent="";speech.el.id="speechPage";
        element("div","eyebrow","01 / ИСХОДНИК",speech.el);
        sectionTitle("Видео","Выделите слой со звуком и нажмите «Распознать речь».",speech.el);
        var source=element("div","source-card surface","",speech.el);
        element("h2","card-heading","Распознавание речи",source);
        element("div","source-symbol","≋",source);element("div","source-title","Ваш голос. Ваши слова.",source);
        element("p","micro-copy","Распознавание на вашем компьютере",source);
        var sourceFields=element("div","source-fields","",source);
        field("language","Язык речи",sourceFields);field("model","Качество",sourceFields);
        button("Устройство и словарь →","text-button",speech.el,function(){openSettings("recognition");});
        var saved=element("div","secondary-action","",speech.el);place("load",saved);compact("load","Загрузить готовый текст…","Загрузить результат распознавания JSON");
        var text=place("textPage",view.body,"step-page");text.el.textContent="";text.el.id="textPage";
        element("div","eyebrow","02 / РЕДАКТОР",text.el);sectionTitle("Текст","Выделите слово: акцент, перенос или разделение.",text.el);
        view.empty=element("div","surface empty-state","Сначала распознайте речь или загрузите готовый текст в разделе «Видео».",text.el);
        view.editorArea=element("div","editor-area","",text.el);
        view.phraseCount=element("div","field-label","",view.editorArea);
        var phraseNav=element("div","phrase-navigation","",view.editorArea);
        compact("prevPhrase","←","Предыдущая фраза");compact("nextPhrase","→","Следующая фраза");
        place("prevPhrase",phraseNav);place("phrase",phraseNav);place("nextPhrase",phraseNav);roles.phrase.el.setAttribute("aria-label","Выбрать фразу");
        var editorField=element("div","editor-field","",view.editorArea);editorField.dataset.field="editor";
        var editor=place("editor",editorField,"caption-editor").input;editor.setAttribute("aria-label","Текст субтитров");editor.spellcheck=false;
        view.tools=element("div","word-toolbar","",editorField);view.tools.hidden=true;view.tools.setAttribute("role","toolbar");view.tools.setAttribute("aria-label","Правки выделенного текста");
        view.toolsLabel=element("span","selection-label","",view.tools);
        [["Акцент","accent"],["Перенос","line"],["Разделить","phrase"]].forEach(function(item){
            var b=button(item[0],"",view.tools,function(){editSelected(item[1]);});b.onmousedown=function(event){event.preventDefault();};
        });
        ["select","keyup","mouseup","input"].forEach(function(event){editor.addEventListener(event,showWordTools);});
        editor.addEventListener("keydown",function(event){
            if(event.key==="Escape"){view.tools.hidden=true;return;}
            if((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key==="A" || event.code==="KeyA")){event.preventDefault();showWordTools();editSelected("accent");}
        });
        var textActions=element("div","editor-actions","",view.editorArea);place("listen",textActions,"text-button");compact("listen","▷ Прослушать","Прослушать выбранную фразу");
        view.wordDetails=element("details","action-menu","",textActions);view.wordMenu=element("summary","","Правки ⋯",view.wordDetails);
        var editMenu=element("div","popover","",view.wordDetails);
        [["Акцент на слове","accent"],["Перенос перед словом","line"],["Разделить перед словом","phrase"]].forEach(function(item){button(item[0],"",editMenu,function(){editSelected(item[1]);});});
        ["undoEdit","save","reset"].forEach(function(role){place(role,editMenu);});
        var style=place("stylePage",view.body,"step-page");style.el.textContent="";style.el.id="stylePage";
        element("div","eyebrow","03 / ОФОРМЛЕНИЕ",style.el);sectionTitle("Стиль","Видеопример — по наведению",style.el);
        var styleToolbar=element("div","style-toolbar","",style.el);
        styleToolbar.appendChild(style.el.querySelector(".section-copy"));
        var filter=element("div","filter-row","",styleToolbar);place("favorites",filter);
        var grid=element("div","style-grid","",style.el);
        for(var k=0;k<4;k++)(function(index){
            var record=roles["galleryCard"+index];if(!record)return;
            record.tile=element("article","style-tile","",grid);
            var frame=button("","preview-frame",record.tile,function(){send({action:"click",id:record.id});});
            frame.setAttribute("aria-label","Выбрать стиль");record.frame=frame;
            record.video=element("video","","",frame);videoRecords.push(record);record.tile._previewRecord=record;
            if(previewObserver)previewObserver.observe(record.tile);record.video.muted=true;record.video.loop=true;record.video.playsInline=true;record.video.preload="none";
            record.caption=element("div","preview-caption","",frame);record.previewLabel=element("span","preview-label","",frame);
            var info=element("div","tile-info","",record.tile);place("galleryCard"+index,info);place("galleryStar"+index,info);
            record.tile.onmouseenter=function(){playPreview(record);};record.tile.onmouseleave=function(){stopVideos();};
            frame.onfocus=function(){playPreview(record);};frame.onblur=function(){stopVideos();};
            preview(record,record.meta);
        })(k);
        var pages=element("div","gallery-pagination","",style.el);place("galleryPrev",pages);place("galleryPage",pages);place("galleryNext",pages);
        var quickCard=element("section","quick-card surface","",style.el);
        element("h2","card-heading","Параметры субтитров",quickCard);
        var quick=element("div","form-grid quick-settings","",quickCard);
        field("quickSize","Размер, %",quick);field("quickPosition","Положение",quick);field("intensity","Интенсивность",quick);
        button("Шрифт и детали →","text-button",style.el,function(){openSettings("font");});
        var finish=place("finishPage",view.body,"step-page");
        if(finish){
            finish.el.id="finishPage";var finishHead=element("div","","");
            element("div","eyebrow","04 / ПРАВКА",finishHead);
            sectionTitle("Правка","Положение, анимация и стиль готовых субтитров. Текст можно двигать и мышью в AE.",finishHead);
            finish.el.insertBefore(finishHead,finish.el.firstChild);
        }
        view.backdrop=button("","drawer-backdrop",workspace,closeSettings);view.backdrop.setAttribute("aria-label","Закрыть настройки");view.backdrop.tabIndex=-1;
        view.drawer=element("aside","settings-drawer","",workspace);view.drawer.id="settings-drawer";view.drawer.setAttribute("role","dialog");view.drawer.setAttribute("aria-labelledby","settings-title");
        var drawerHead=element("div","drawer-header","",view.drawer);element("h2","","Настройки",drawerHead).id="settings-title";
        view.close=button("×","close-button",drawerHead,closeSettings);view.close.setAttribute("aria-label","Закрыть настройки");
        view.settingsSelect=element("select","settings-select","",view.drawer);view.settingsSelect.setAttribute("aria-label","Раздел настроек");
        var categories=[["recognition","Распознавание"],["font","Шрифт"],["viewPage","Вид и эффекты"],["layoutPage","Раскладка"],["animationPage","Анимация"],["layersPage","Слои"],["toolsPage","Инструменты"],["sfxPage","Звук · вручную"],["project","Проект"]];
        view.settingsBody=element("div","drawer-scroll","",view.drawer);
        categories.forEach(function(item){var option=element("option","",item[1],view.settingsSelect);option.value=item[0];view.sections[item[0]]=element("section","settings-section","",view.settingsBody);});
        view.settingsSelect.onchange=function(){ui.section=this.value;view.settingsBody.scrollTop=0;renderLayout();};
        var recognition=view.sections.recognition;
        field("device","Устройство",recognition);field("prompt","Имена, бренды и термины",recognition);
        var font=view.sections.font;
        var targets=element("div","action-row","",font);place("fontTargetBase",targets);place("fontTargetAccent",targets);
        field("recentFonts","Последние шрифты",font);field("fontSearch","Найти шрифт",font);field("fontFamily","Семейство",font);field("fontStyle","Начертание",font);field("fontPS","PostScript-имя",font);
        var fonts=details("Применить к существующим слоям",font);place("fontSelected",fonts);place("fontAll",fonts);
        ["viewPage","layoutPage","animationPage","layersPage","toolsPage","sfxPage"].forEach(function(role){
            var r=place(role,view.sections[role],"advanced-page");r.el.hidden=false;
        });
        var sound=view.sections.sfxPage;
        var soundNote=element("p","micro-copy","Звуки добавляются только по вашей команде. После добавления их можно двигать и подгонять в композиции.");sound.insertBefore(soundNote,sound.firstChild);
        var project=view.sections.project;place("replace",project);place("savePreset",project);
        button("Удалить старые NOIR-превью","quiet-action",project,function(){if(window.confirm("Удалить отдельные композиции NOIR-превью? Используемые в монтаже будут пропущены. Можно отменить через Ctrl+Z в AE."))send({action:"removePreviews"});});
        element("p","micro-copy","Ваши настройки и избранные стили сохраняются автоматически.",project);
        renderLayout();
    }
    function update(data) {
        var previousPhrase=workflow.phrase, previousDataRevision=workflow.dataRevision;
        if(data.full){app.textContent="";records={};editableInputs=[];}
        if(data.workflow)workflow=data.workflow;
        view.caretPhrase=workflow.phrase;
        if(workflow.completed>ui.completed){
            ui.successUntil=Date.now()+4000;ui.completed=workflow.completed;clearTimeout(successTimer);
            successTimer=setTimeout(function(){ui.successUntil=0;renderLayout();},4000);
        }
        data.nodes.forEach(function(node){if(!records[node.id])records[node.id]=create(node);apply(records[node.id],node);});
        if(data.full)curated();
        if(workflow.hasData && workflow.dataRevision!==previousDataRevision){ui.main=1;if(view.body)view.body.scrollTop=0;}
        // Legacy pages supply controls, while HTML owns independent main and inspector navigation.
        ["viewPage","layoutPage","animationPage","layersPage","toolsPage","sfxPage"].forEach(function(role){if(roles[role])roles[role].el.hidden=false;});
        if(previousPhrase!==workflow.phrase && roles.editor && document.activeElement!==roles.editor.input){
            var editor=roles.editor.input,lines=editor.value.split("\n"),start=0;
            for(var i=0;i<workflow.phrase;i++)start+=(lines[i] || "").length+1;
            editor.setSelectionRange(start,start+(lines[workflow.phrase] || "").length);
            editor.scrollTop=workflow.phrase*25;view.tools.hidden=true;
        }
        renderLayout();
    }
    document.body.addEventListener("wheel",function(event){
        if(event.ctrlKey || !view.body)return;
        var target=event.target,delta=event.deltaY*(event.deltaMode===1?30:event.deltaMode===2?view.body.clientHeight:1);
        var editor=target.closest("textarea");
        if(editor && ((delta>0 && editor.scrollTop<editor.scrollHeight-editor.clientHeight-1) || (delta<0 && editor.scrollTop>0))){editor.scrollTop+=delta;event.preventDefault();return;}
        var area=ui.settings && (view.drawer.contains(target) || window.innerWidth<760)?view.settingsBody:view.body;
        area.scrollTop+=delta;event.preventDefault();
    },{passive:false});
    document.addEventListener("visibilitychange",function(){if(document.hidden)stopVideos();schedulePoll();});
    document.addEventListener("click",function(event){Array.prototype.forEach.call(app.querySelectorAll(".action-menu[open]"),function(menu){if(!menu.contains(event.target))menu.open=false;});});
    window.addEventListener("blur",function(){stopVideos();});
    window.addEventListener("resize",renderLayout);
    document.addEventListener("keydown",function(event){
        if(event.key==="Escape")Array.prototype.forEach.call(app.querySelectorAll(".action-menu[open]"),function(menu){menu.open=false;});
        if(event.key==="Escape" && ui.settings){event.preventDefault();closeSettings();}
        if(event.key==="Tab" && ui.settings && window.innerWidth<760){
            var focusable=Array.prototype.filter.call(view.drawer.querySelectorAll("button,select,input,summary,textarea"),function(el){return !el.disabled && el.getClientRects().length;});
            var first=focusable[0],last=focusable[focusable.length-1];
            if(event.shiftKey && (document.activeElement===first || !view.drawer.contains(document.activeElement))){event.preventDefault();last.focus();}
            else if(!event.shiftKey && (document.activeElement===last || !view.drawer.contains(document.activeElement))){event.preventDefault();first.focus();}
        }
    });
    if(!window.__adobe_cep__){showError("Откройте Window → Extensions (Legacy) → NOIR Captions · HTML в After Effects.");return;}
    send({action:"open"});
    // Nothing ticks while idle. Polls exist only for an active recognition job.
    window.addEventListener("unload",function(){clearTimeout(timer);clearTimeout(noticeTimer);clearTimeout(successTimer);stopVideos();if(previewObserver)previewObserver.disconnect();});
}());
