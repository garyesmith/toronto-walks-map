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
            ["./walk1.geojson", "#FFEA00", 5, 5]
        ];

        this.sightMarkersUrl = "./points.geojson";

        this.personIcon = L.icon({
            iconUrl: './assets/person.png',
            iconSize: [24, 24], // size here is in pixels
        });

        this.userMarker;
        this.userMarkerCircleSm;
        this.userMarkerCircleLg;
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
        this.infoDiv.innerHTML = `
            <h2>${props['SightName']}</h2>
            <p>
                <img src="./images/${props['SightImage']}" alt="${props['SightName']}" />
            ${props['SightDesc']}</p>
        `;

        this.clickZoom(e);

    }

    // handle global window events
    bindGlobalEvents() {

        // reset map size on window resize
        window.addEventListener('resize', () => {
            if (this.map) this.map.invalidateSize();
        });

        // draw circle to highlight current user location when/if determined
        this.map.on('locationfound', (e) => {

            if (!this.userMarker) {

                this.userMarker=L.marker(e.latlng, {icon: this.personIcon, pane: 'location_pane'}).addTo(this.map);
                this.userMarkerCircleSm=L.circle(e.latlng, {radius: 12, pane: 'location_pane'}).addTo(this.map).setStyle({ 
                    fillColor: "#2f8cdd", 
                    color: "transparent", 
                    weight: 2,
                    interactive: true
                });
                this.userMarkerCircleLg=L.circle(e.latlng, {radius: 1000, pane: 'location_pane'}).addTo(this.map).setStyle({ 
                    fillColor: "transparent", 
                    color: "#2f8cdd", 
                    dashArray: '5, 5',
                    weight: 2,
                    interactive: true
                });
            } else {
                this.userMarker.setLatLng(e.latlng);
                this.userMarkerCircleSm.setLatLng(e.latlng);
                this.userMarkerCircleLg.setLatLng(e.latlng);
            }

        });
    }

    // trigger a request to determine user's current location
    locateUser() {
        this.map.locate({watch: true, maximumAge: 0, enableHighAccuracy: true});
    }
}

// init the app
const myMapApp = new MapApp();
myMapApp.init();