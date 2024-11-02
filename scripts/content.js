chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      if (request.from === "popup" && request.subject === "DOMInfo"){
        if (document.getElementsByTagName("footer")[0].firstChild.tagName == 'IMG'){
          var name = document.getElementsByTagName("footer")[0].childNodes[1].firstChild.firstChild.firstChild.firstChild.childNodes[1].firstChild.childNodes[1].innerText;
        }
        else{
          var name = document.getElementsByTagName("footer")[0].firstChild.firstChild.firstChild.firstChild.firstChild.childNodes[1].firstChild.childNodes[1].innerText;
        }
        sendResponse(name);}
    }
);