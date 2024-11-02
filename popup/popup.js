let currentIframe = null;

// Function to update the track in the iframe (spotify embed)
window.updateTrack = function(newTrackId) {
  if (currentIframe) {
    currentIframe.src = `https://open.spotify.com/embed/track/${newTrackId}`;
  } else {
    loadSpotifyEmbed(newTrackId);
  }
};

function loadSpotifyEmbed(trackId) {
  const container = document.getElementById('spotify-embed-container');
  container.innerHTML = ""
  
  // Remove existing iframe if there is one
  if (currentIframe) {
    currentIframe.remove();
  }
  
  const iframe = document.createElement('iframe');
  iframe.id = 'theiframe';
  iframe.className = 'm-2';
  iframe.style.borderRadius = '12px';
  iframe.src = `https://open.spotify.com/embed/track/${trackId}`;
  iframe.style.height = '100%';
  iframe.frameBorder = '0';
  iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  
  container.appendChild(iframe);
  currentIframe = iframe;
}


