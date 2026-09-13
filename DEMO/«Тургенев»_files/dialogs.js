
function closeDialog()
{
    document.getElementById('dlg_form').style.display = 'none';
    document.getElementById('dlg_shadow').style.display = 'none';
}

var chkidcnt = 0;
function showDialog(form_id, className)
{
    document.getElementById('dlg_shadow').style.display = 'block';

    chkidcnt = 0;
    document.getElementById('dlg_main_block').innerHTML = form_id.match(/\s/)?form_id:document.getElementById(form_id).innerHTML.replace(/ type="checkbox"([^<>]*)>\s*<label>/g, function (m, p1){chkidcnt++; return 'id="dlg_chkbox_'+chkidcnt+'" type="checkbox"'+p1+'><label for="dlg_chkbox_'+chkidcnt+'">'});

    var dialog_form = document.getElementById('dlg_form');

    dialog_form.className = className? className: '';

    dialog_form.style.display = 'block';
    dialog_form.style.top = (window.pageYOffset + (window.innerHeight - dialog_form.offsetHeight)/2) +'px';

    return dialog_form;
}

function showAlert(title, message)
{
    var form = "<h2>"+title+"</h2>"+
               "<div><div class='dlg_message'>"+message+"</div></div>"+
               "<div class='dlb_btn_block'><input type='button' class='btn' value='Ok' onclick='closeDialog()'></div>";
    showDialog(form);
}


function currentDialogForm()
{
    var dialog_form = document.getElementById('dlg_form');
    var forms = dialog_form.getElementsByTagName("FORM");

    return forms[0];
}

function currentDialog()
{
    return document.getElementById('dlg_form');
}


var dlgRequest = null;
var dlgRequestInProgress = false;
function sendDialogRequest(form, nextdialog, events)
{
    if (dlgRequestInProgress)
        return;

    while (form && form.tagName!='FORM')
        form = form.parentNode;

    if (!form)
        return;

    if (!dlgRequest)
        dlgRequest = createRequest();

    var request_url = 'm=ajax';

    var ERRORS = {};

    var inputs = form.getElementsByTagName('INPUT');
    for (var i=0; i<inputs.length; i++) {
        if (inputs[i].type=='submit') continue;

        var name = inputs[i].name;
        var value = inputs[i].value;

        if (inputs[i].type=='checkbox') {
            value = inputs[i].checked? 1: '';
        } else if (value == '' && !inputs[i].getAttribute('optional')) {
            ERRORS[name] = "Поле не заполнено";
        } else if (name == 'email') {
            if (!value.match(/^\s*[\w\.\-]+@[\w\.\-]+\.\w+\s*$/) || value.match(/\.\./))
                ERRORS[name] = "Некорректный адрес элетронной почты";
        } else if (name == 'password_confirm') {
            if (value != form.password.value)
                ERRORS[name] = "Пароли не совпадают";
        }

        request_url += '&'+name+'='+encodeURIComponent(value);
    }

    var inputs = form.getElementsByTagName('TEXTAREA');
    for (var i=0; i<inputs.length; i++) {
        var name = inputs[i].name;
        var value = inputs[i].value;

        if (value == '') {
            ERRORS[name] = "Поле не заполнено";
        }

        request_url += '&'+name+'='+encodeURIComponent(value);
    }


    if (Object.keys(ERRORS).length) {
        showDialogErrors(form, ERRORS);
        return;
    }

    dlgRequestInProgress = true;
    dlgRequest.form = form;
    dlgRequest.nextdialog = nextdialog;
    dlgRequest.eventshandler = events;

    dlgRequest.form.classList.add('submiting');

    if (form.method.toLowerCase() == 'post') {
        dlgRequest.open('POST', form.action, true);
        dlgRequest.onreadystatechange = dialogRequestDone;
        dlgRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
        dlgRequest.send(request_url + '&rfsh='+encodeURIComponent(now));
    } else {
        var now = new Date;
        dlgRequest.open('GET', form.action + '?' + request_url+ '&rfsh='+encodeURIComponent(now), true);
        dlgRequest.onreadystatechange = dialogRequestDone;
        dlgRequest.send(null);
    }
}

function dialogRequestDone()
{
    if (dlgRequest.readyState==4)
    {
        dlgRequestInProgress = false;
        dlgRequest.form.classList.remove('submiting');

        if (dlgRequest.status==200)
        {
            var result = eval('result = ' + dlgRequest.responseText + ';');

            if (result.ERRORS)
            {
                 showDialogErrors(dlgRequest.form, result.ERRORS);
            }
            else if (result.usess)
            {
                var date = new Date;
                date.setDate(date.getDate() + 30);
                document.cookie = "usess="+result.usess+";path=/;expires="+date.toUTCString();
                if (dlgRequest.eventshandler && dlgRequest.eventshandler.onsuccess)
                    dlgRequest.eventshandler.onsuccess(dlg, result);
                else
                    location.href = location.href.replace(/[\?#].*/, '');
            }
            else if (result.done)
            {
                var hres = true;
                if (dlgRequest.eventshandler && dlgRequest.eventshandler.onload)
                    hres = dlgRequest.eventshandler.onload(dlgRequest.form, result);
                var dlg = null;
                if (dlgRequest.nextdialog && hres) {
                    dlg = showDialog(dlgRequest.nextdialog);
                    if (dlg && dlgRequest.eventshandler && dlgRequest.eventshandler.onshow)
                        dlgRequest.eventshandler.onshow(dlg, result);
                } else if (dlgRequest.eventshandler && dlgRequest.eventshandler.onsuccess)
                    dlgRequest.eventshandler.onsuccess(dlg, result);
            }
            else
            {
                showDialogErrors(dlgRequest.form, { common: 'Ошибка' });
            }
        }
        else
        {
            showDialogErrors(dlgRequest.form, { connection: "Ошибка соединения с сервером: " + dlgRequest.status + " " + dlgRequest.statusText });
        }
    }
}

function setDlgInputError(input, error)
{
    var d = input.parentNode;

    if (error) {
        var es = d.getElementsByClassName('dlg_err_msg');
        var e = null;
        if (es.length>0) {
            e = es[0];
        } else {
            e = document.createElement('DIV');
            e.className = 'dlg_err_msg';
            d.appendChild(e);
        }
        e.innerHTML = error;
        if (!d.classList.contains('dlg_error'))
            d.classList.add('dlg_error');
    } else {
        d.classList.remove('dlg_error');
    }
}

function showDialogErrors(form, errors)
{
    var inputs = form.getElementsByTagName('INPUT');
    for (var i=0; i<inputs.length; i++)
        setDlgInputError(inputs[i], errors[inputs[i].name]);

    var inputs = form.getElementsByTagName('TEXTAREA');
    for (var i=0; i<inputs.length; i++)
        setDlgInputError(inputs[i], errors[inputs[i].name]);

    var shared_error = form.getElementsByClassName('dlg_shared_error');
    shared_error = (shared_error.length)? shared_error[0]: null;
    if (errors['connection'] || errors['common']) {
        if (!shared_error) {
            shared_error = document.createElement('div');
            shared_error.className = 'dlg_shared_error dlg_err_msg';

            var buttons = form.getElementsByClassName('dlb_btn_block');
            if (buttons.length) 
                buttons[0].parentNode.insertBefore(shared_error, buttons[0]);
            else
                form.appendChild(shared_error);
        }

        shared_error.classList.add('dlg_error');
        shared_error.innerHTML = errors['connection']? errors['connection']: errors['common'];
    } else if (shared_error) {
        shared_error.classList.remove('dlg_error');
        shared_error.innerHTML = '';
    }
}

function dialogCheckboxClick(chk)
{
    if (chk.checked)
        chk.parentNode.classList.add('checked');
    else
        chk.parentNode.classList.remove('checked');
}

function dialogDisableSubmit(form, disable) {
    var items = form.getElementsByTagName('INPUT');
    for (var item of items) {
        if (item.type == "submit") {
            item.disabled = disable;
        }
    }
}


function dialogSelectToggle(sl)
{
    sl.parentNode.classList.toggle('open');
}

function dialogOptionSelect(li)
{
    var dv = li.parentNode.parentNode;

    var i = dv.getElementsByTagName('INPUT');
    i[0].value = li.classList.contains('placeholder')? '': li.innerHTML;

    dv.classList.remove('open');
}