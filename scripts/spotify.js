// Ben Mongirdas, 2024
/* All authentication code courtesy of Spotify, found at https://github.com/spotify/web-api-examples/tree/master/authorization/authorization_code_pkce*/

const clientId = 'bb09eecd5e7e413f9239a2ade6142dd7'; 
const redirectUrl = 'http://localhost:8080';        

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope = '';

const currentToken = {
    get access_token() { return localStorage.getItem('access_token') || null; },
    get refresh_token() { return localStorage.getItem('refresh_token') || null; },
    get expires_in() { return localStorage.getItem('refresh_in') || null },
    get expires() { return localStorage.getItem('expires') || null },
  
    save: function (response) {
      const { access_token, refresh_token, expires_in } = response;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('expires_in', expires_in);
  
      const now = new Date();
      const expiry = new Date(now.getTime() + (expires_in * 1000));
      localStorage.setItem('expires', expiry);
    }
  };

var url, wholeName, selectedSongID, songs;

// Initiates search for song, or prompts user to open the extension on the correct page
chrome.tabs.query({active: true, currentWindow: true}).then(tab =>{
  if (tab[0].url.includes("siriusxm.com/player")){
      document.getElementById("outputHere").addEventListener("click", openTab);
      checkToken();
  }
  else{
      let body = document.getElementById("thebody");
      body.innerHTML = "<h3>Open extension while on SiriusXM Player page!</h3>";
      body.style.height = "auto";
  }
});

// helper function to open a new tab
function openTab(){
    chrome.tabs.create({url:url});
}


// Initiates search and creation of the song list
async function siriusGetSong() {
    // Once the DOM is ready...
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    const response = await chrome.tabs.sendMessage(tab.id, {from: 'popup', subject: 'DOMInfo'});
    wholeName = response;

    // Now, we can grab the spotify song URL
    songs = await fetchSongs(wholeName);
    if(songs.length == 0){
        let body = document.getElementById("thebody");
        body.innerHTML = "<h3>Song not found!</h3>";
        body.style.height = "auto";
    }
    else{
        url = songs[0].external_urls.spotify;
        selectedSongID = songs[0].uri.replace("spotify:track:", '');
        window.updateTrack(selectedSongID) // this updates the iframe
        if (songs.length > 1){
            createMatchList(songs.slice(1)); // this creates the list of matches
        }
    }
}


async function fetchSongs(completeName){
    if (!completeName){
        let body = document.getElementById("thebody");
        body.innerHTML = "<h3>Song not found!</h3>";
        body.style.height = "auto";
        return [];
    }

    // SiriusXM puts artist names in all sorts of different formats, so we need to check against all of them to find matches
    let nameArray = completeName.split('-');
    let artistNameArray = nameArray[0].trim().split('/');
    if (artistNameArray.length > 1){artistNameArray.push(nameArray[0].trim());}
    artistNameArray.push('"' + nameArray[0].trim() + '"');
    artistNameArray.push(nameArray[0] + "-" + nameArray[1]);

    let songName = nameArray.slice(1).concat().join("");
    songName = '"' + songName.trim() + '"'; // quotes are helpful for spotify search
    let songsFound = [];

    // Searches over each artist to try to find the right song
    for (artistName of artistNameArray){
        const apiUrl = `https://api.spotify.com/v1/search?q="remaster name: ${songName} artist: ${artistName}"&limit=50&type=track`;
        const requestOptions = {
            method: 'GET',
            headers: {
            'Authorization': `Bearer ${currentToken.access_token}`,
            },
        };

        // Make a GET request
        let output = await fetch(apiUrl, requestOptions)
        .then(response => {
            if (!response.ok) {
            throw new Error('Network response unsuccessful');
            }
            return response.json();
        })
        .catch(error => {
            console.error('Error:', error);
        });

        // Now, we find all relevant matches
        songsFound = findSong(output, songName, artistNameArray);
        if (songsFound.length > 0){
            return songsFound;
        }
    }
}

function findSong(input, song, artistNameArray) {
    // Helper functions
    const cleanSongName = (name) => name
        .toLowerCase()
        .replace(/[''"]/g, "'")               // Normalize quotes
        .replace(/ *\([^)]*\) */g, "")       // Remove (parentheses)
        .replace(/ *\[[^\]]*\] */g, "")      // Remove [brackets]
        //.replace(/ - .*/, "");               // Remove everything after hyphen
    
    const isArtistMatch = (spotifyArtists, siriusArtists) => {
      return spotifyArtists.some(artist => 
        siriusArtists.some(siriusArtist => 
          siriusArtist.toLowerCase() === artist.name.toLowerCase()
        )
      );
    };
  
    // Clean the search query once
    const searchQuery = song.slice(1, -1).toLowerCase();
    const cleanedSearchQuery = cleanSongName(searchQuery);
  
    // Initialize results object
    const results = {
      exactMatches: [],
      remasterLiveVersions: [],
      partialMatches: [],
      titleInclusions: [],
      otherArtistMatches: []
    };
  
    // Process each track
    input.tracks.items.forEach(track => {
      const cleanedTrackName = cleanSongName(track.name);
      const isArtistMatched = isArtistMatch(track.artists, artistNameArray);
  
      // Exact match
      if (track.name.toLowerCase().replace("'", "'") === searchQuery) {
        if (isArtistMatched) {
          results.exactMatches.push(track);
        } else {
          results.otherArtistMatches.push(track);
        }
        return;
      }
  
      // Partial match
      if (track.name.toLowerCase().includes(searchQuery)) {
        if (!isArtistMatched) return;
        
        if (track.name.toLowerCase().match(/remaster|live/)) {
          results.remasterLiveVersions.push(track);
        } else {
          results.partialMatches.push(track);
        }
        return;
      }
  
      // Title inclusion match
      if (cleanedSearchQuery.includes(cleanedTrackName)) {
        if (isArtistMatched) {
          results.titleInclusions.push(track);
        }
      }
    });
  
    // Combine results in priority order
    const allMatches = [
      ...results.exactMatches,
      ...results.remasterLiveVersions,
      ...results.partialMatches,
      ...results.titleInclusions
    ];
  
    return allMatches.length > 0 ? allMatches : results.otherArtistMatches;
  }

async function checkToken(){
    var currentDate = new Date();
    var oldDate = new Date(currentToken.expires);
    currentDate = new Date(currentDate.getTime());
    console.log(oldDate.getTime())
    if (currentDate.getTime() < oldDate.getTime()) { 
        console.log("Sucessfully fetched the token");
        siriusGetSong();
    }
    else if (isNaN(oldDate.getTime()) || currentToken.expires == null){
        redirectToSpotifyAuthorize();
    }
    else{ //double check to make sure this problem of 1st time use is fixed
        let token = await refreshToken();
        currentToken.save(token);
        siriusGetSong();
    }
}

async function redirectToSpotifyAuthorize() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = crypto.getRandomValues(new Uint8Array(64));
    const randomString = randomValues.reduce((acc, x) => acc + possible[x % possible.length], "");
  
    const code_verifier = randomString;
    const data = new TextEncoder().encode(code_verifier);
    const hashed = await crypto.subtle.digest('SHA-256', data);
  
    const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  
    window.localStorage.setItem('code_verifier', code_verifier);
  
    const authUrl = new URL(authorizationEndpoint)
    const params = {
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      code_challenge_method: 'S256',
      code_challenge: code_challenge_base64,
      redirect_uri: redirectUrl,
    };
  
    authUrl.search = new URLSearchParams(params).toString();
    await createTab(authUrl.toString());
}

// Helper function to refresh spotify auth token
async function refreshToken() {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: currentToken.refresh_token
      }),
    });
  
    return await response.json();
}

// Creates the authentication tab and handles updating the authentication token
function createTab (url) {
    return new Promise(resolve => {
        chrome.windows.create({url, type:"popup"}, async (windowId) => {
            chrome.tabs.onUpdated.addListener(async function listener (changeInfo, info) {
                if (info.url) {
                    if (info.status == 'loading' && info.url.includes("localhost:8080")){
                            chrome.windows.get(windowId.id, {populate:true}).then( async (window)=> {
                                const args = new URLSearchParams(info.url.split('?')[1]);
                                const code = args.get('code');
                                if (code) {
                                    const token = await getToken(code);
                                    currentToken.save(token);
                                    chrome.windows.remove(windowId.id);
                                    siriusGetSong();
                                }})
                    }
                }
                chrome.windows.update(windowId.id, {focused:true});
            });
        });
    });
}

// Grabs token from the code
async function getToken(code) {
    const code_verifier = localStorage.getItem('code_verifier');
  
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUrl,
        code_verifier: code_verifier,
      }),
    });
  
    return await response.json();
}

function enableEmbed(songURI){
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
        const element = document.getElementById('theiframe');
        const options = {
            uri: `spotify:track:${songURI}`
          };
        const callback = (EmbedController) => {};
        IFrameAPI.createController(element, options, callback);
      };
}

// Creates an HTML list of all matching songs
function createMatchList(matchingSongs){
    var topNode = document.getElementById("matches");
    document.getElementById("matchesHeader").innerText = "Other Matches";
    topNode.innerHTML = topNode.innerHTML + `<ul class="matches-list" id="matchesList"></ul>`;
    matchingSongs.map(song =>{
        let artistName = "";
        for (artist of song.artists){
            if (artistName == ""){artistName = artist.name;}
            else{artistName = artistName + " & " + artist.name;}
        }
        let songURI = song.uri.replace("spotify:track:",'');
        var newEl =`<li id="${songURI}" class="matches-node ml-2 mb-2" style="border-radius:10px;"><div class="matches-div"><img class="m-2" style="float:left;border-style:none;border-radius:8px; text-align:center; display:block; margin:auto;" src='${song.album.images[2].url}' height="48px"><p style="margin:auto;width:90%;">${artistName} - ${song.name}</p></div></li>`;
        topNode.insertAdjacentHTML('beforeend', newEl);// = list.innerHTML + newEl;
        document.getElementById(songURI).addEventListener("click", swapSong);
    })
}

function swapSong(event){
    let embedObject;
    for (obj of songs){
        if (obj.uri.replace("spotify:track:",'') == selectedSongID){
            embedObject = obj;
            break;
        }
    }

    selectedSongID = event.currentTarget.id;
    document.getElementById("theiframe").src=`https://open.spotify.com/embed/track/${selectedSongID}?utm_source=generator`
    url = `https://open.spotify.com/track/${selectedSongID}`;

    var matchList = document.getElementById(selectedSongID);
    let artistName = '';
    for (artist of embedObject.artists){
        artistName == "" ? artistName = artist.name : artistName = artistName + " & " + artist.name;
    }
    matchList.id = embedObject.uri.replace("spotify:track:",'');
    matchList.firstChild.firstChild.src = embedObject.album.images[2].url;
    matchList.firstChild.childNodes[1].innerText = artistName + ' - ' + embedObject.name;
    enableEmbed(selectedSongID);
}

/** Limitations
  *The spotify API search function is pretty dumb, and often will not return the correct song or artist for whatever reason. I've attempted to mitigate that as much as possible by requesting the maximum
  *amount of trakcs I can from each api call and checking each of them.
  *Whoever catalogs the SiriusXM songs does not always put the full name of the song, or sometimes the song will only be available as a remaster on spotify's search API. This will cause issues finding the song.
  */