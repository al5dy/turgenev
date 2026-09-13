function createRequest()
{
var request = false;

try {
    request = new XMLHttpRequest();
} catch (trymicrosoft) {
    try {
        request = new ActiveXObject('Msxml2.XMLHTTP');
    } catch (othermicrosoft) {
        try {
            request = new ActiveXObject('Microsoft.XMLHTTP');
        } catch (failed) {
            request = false;
        }
    }
}

return request;
}

function urlencode(plaintext)
{
    return encodeURIComponent(plaintext);
}