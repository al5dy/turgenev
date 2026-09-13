function unsh_shadowForm()
{
    var sh = document.createElement('DIV');
    sh.style.width = '100vw';
    sh.style.height = '100vw';
    sh.style.opacity = '0.6';
    sh.style.position = 'fixed';
    sh.style.left = 0;
    sh.style.top = 0;
    sh.style.backgroundColor = 'white';
    sh.style.zIndex = 10000;
    document.body.appendChild(sh);
}


window.onbeforeunload = unsh_shadowForm;
