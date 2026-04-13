// init map and zoom
const map = L.map('map',{
    preferCanvas: true,
    center: [43.6425099,-79.3745239],
    zoom: 13
});

// add base tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// reference to info panel div
const infoDiv = document.getElementById('info');


// 5. Load GeoJSON using Leaflet-AJAX
const geoJson = [
    ["./green_spaces.json", "#adc57b", 1, 1, false],
    ["./sidewalks.json", "#999999", 1, 2, false],
    ["./water.json", "#91cbef", 1, 3, false],
    ["./buildings.json", "#d0b38f", 1, 4, false],
    ["./subway.geojson", "#444444", 4, 5, false],
    ["./sights.geojson", "#FFEA00", 1, 6, true]
];

var layers=[];

for (let i = 0; i < geoJson.length; i++) {
    map.createPane('pane'+i);
    map.getPane('pane'+i).style.zIndex = 500+geoJson[i][3];
    layers[i] = new L.GeoJSON.AJAX(geoJson[i][0], {
    style: function(feature) {
            return {
                color: geoJson[i][1],
                weight: geoJson[i][2],
                fillOpacity: 0.5
            };
        },
        pane: 'pane'+i
    });
    layers[i].addTo(map);
    layers[i].on('click', function(e) {
        sightClicked(e.layer.feature.properties, e);
    });
}
    
function sightClicked(props, e) {

    console.log(props);
    let html = `<h2>${props['SightName']}</h2>`;
    html += `<img src="./images/${props['SightImage']}" alt="${props['SightName']}" />`;
    html += `<p>${props['SightDesc']}</p>`;
    
    infoDiv.innerHTML = html;

    // highligh selected sight
    layers[5].setStyle({ fillColor: "#FFEA00", color: "#FFEA00", weight: 1 }); // Reset others
    e.target.setStyle({ fillColor: "#FFEA00", color: "#FFA500", weight: 3 }); // Highlight this one
    
    // zoom to the sight
    map.fitBounds(e.target.getBounds(), { maxZoom: 16, animate: true });
}

// trigger a map redraw when the window resizes
window.addEventListener('resize', () => {
    map.invalidateSize();
});

// draw a blue circle at the user's current geographical location
function onLocationFound(e) {
    var radius = e.accuracy / 2;
    L.circle(e.latlng, radius).addTo(map);
}
map.on('locationfound', onLocationFound);
map.locate();
