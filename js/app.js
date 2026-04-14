class MapApp {

    constructor() {

        // local properties (state)
        this.map = null;
        this.infoDiv = document.getElementById('info');
        this.layers = [];
        
        // config (json file, color, weight)
        this.layerConfigs = [
            ["./green_spaces.json", "#adc57b", 1, 1],
            ["./sidewalks.json", "#999999", 1, 2],
            ["./water.json", "#91cbef", 1, 3],
            ["./buildings.json", "#d0b38f", 1, 4],
            ["./walk1.geojson", "orange", 5, 5]
        ];

        this.sightMarkersUrl = "./points.geojson";

        this.personIcon = L.icon({
            iconUrl: './assets/person.png',
            iconSize: [24, 24], // size here is in pixels
        });

    }

    init() {
        this.setupMap();
        this.addTileLayer();
        this.loadBaseLayers();
        this.loadSightMarkers();
        this.bindGlobalEvents();
        this.locateUser();
    }

    // init map
    setupMap() {
        this.map = L.map('map', {
            preferCanvas: true,
            center: [43.6425099, -79.3745239],
            zoom: 14
        });
        this.locationControl = L.control.locate({
            position: "topleft",
            strings: {
                title: "Locate me"
            },
            keepCurrentZoomLevel: [13, 18],
            clickBehavior: {
                inView: 'setView', 
                outOfView: 'setView', 
                inViewNotFollowing: 'setView'
            },
            setView: false
        }).addTo(this.map);
    }
    
    // add base tile layer
    addTileLayer() {
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);
    }

    // create and add GeoJSON layers based on config values
    loadBaseLayers() {
        this.layerConfigs.forEach((config, i) => {
            const [url, color, weight, zIndex] = config;

            // add each layer to a new map pane, to control z-index ordering
            const paneName = `pane${i}`;
            this.map.createPane(paneName);
            var z = 200 + parseInt(zIndex,10);
            this.map.getPane(paneName).style.zIndex = z;

            // load GeoJSON layer with AJAX, style, and store reference to it in an array
            this.layers[i] = new L.GeoJSON.AJAX(url, {
                style: () => ({
                    color: color,
                    weight: weight,
                    fillOpacity: 0.5,
                    opacity: 0.7
                }),
                pane: paneName
            });

            this.layers[i].addTo(this.map);

        });

    }

    // create and add GeoJSON sight markers
    loadSightMarkers() {

        const url = this.sightMarkersUrl;
        const nextLayerIndex = this.layers.length;

        // create pane for user location marker first, to ensure it appears below sight markers
        var paneName = 'location_pane';
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 300;

        // add each layer to a new map pane, to control z-index ordering
        paneName = `pane${nextLayerIndex}`;
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.layers[nextLayerIndex] = new L.GeoJSON.AJAX(url, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng);
            }, 
            pane: paneName,
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    this.handleSightClick(feature, e);
                });
            },
        });

        this.layers[nextLayerIndex].addTo(this.map);

    }

    clickZoom(e) {
        this.map.setView(e.target.getLatLng(), 16);
    }

    // display clicked sight details in info bar, highlight it, and zoom to it
    handleSightClick(feature, e) {

        const props = feature.properties;

        // populate the info bar
        var infoHtml = `
            <h2>${props['SightName']}</h2>
            <p>
                <img src="./images/${props['SightImage']}" alt="${props['SightName']}" />
                ${props['SightDesc']}
            </p>
        `;

        if (props['SightUrl'] && props['SightUrl'].length) {
            infoHtml += `
                <p><a href="${props['SightUrl']}" target="_blank">${props['SightUrl']}</a></p>
            `;
        }

        this.infoDiv.innerHTML=infoHtml;

        this.clickZoom(e);

    }

    // handle global window events
    bindGlobalEvents() {

        // reset map size on window resize
        window.addEventListener('resize', () => {
            if (this.map) this.map.invalidateSize();
        });

    }

    // trigger a request to determine user's current location
    locateUser() {
        this.locationControl.start();
    }
}

// init the app
const myMapApp = new MapApp();
myMapApp.init();