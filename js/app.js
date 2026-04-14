class MapApp {

    constructor() {

        // local properties (state)
        this.map = null;
        this.infoDiv = document.getElementById('info');
        this.mapLayers = [];
        this.walkLayer = null;
        
        // config (json file, color, weight)
        this.layerConfigs = [
            ["./green_spaces.json", "#adc57b", 1],
            ["./sidewalks.json", "#999999", 1],
            ["./water.json", "#91cbef", 1],
            ["./buildings.json", "#d0b38f", 1]
        ];

        this.sightMarkersUrl = "./points.geojson";

        this.currWalkNumber = 1
        
    }

    init() {
        this.setupMap();
        this.loadMapLayers();
        this.addTileLayer();
        this.loadWalkLayer(this.currWalkNumber);
        this.loadMaskLayer();
        this.loadSightMarkers();
        this.bindGlobalEvents();
        this.locateUser();
    }

    // init map
    setupMap() {
        var bounds = L.latLngBounds([[43.5886087, -79.4506467], [43.6905451, -79.2889900]]);
        this.map = L.map('map', {
            preferCanvas: true,
            center: [43.6425099, -79.3745239],
            zoom: 14,
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            minZoom: 13,
            maxZoom: 16
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
        this.map.createPane('basemap_pane');
        this.map.getPane('basemap_pane').style.zIndex = 250;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 16,
            updateWhenZooming: false,
            pane: 'basemap_pane'
        }).addTo(this.map);
    }

    // create and add GeoJSON layers based on config values
    loadMapLayers() {
        this.map.createPane('layers_pane');
        this.map.getPane('layers_pane').style.zIndex = 200;
        this.layerConfigs.forEach((config, i) => {
            const [url, color, weight] = config;

            // load GeoJSON layer with AJAX, style, and store reference to it in an array
            this.mapLayers[i] = new L.GeoJSON.AJAX(url, {
                style: () => ({
                    color: color,
                    weight: weight,
                    fillOpacity: 0.5,
                    opacity: 0.7
                }),
                pane: 'layers_pane'
            });

            this.mapLayers[i].addTo(this.map);

        });

    }

    // create and add GeoJSON walk path layers
    loadWalkLayer(walkNumber) {

        const url="./walk" + walkNumber + ".geojson";

        // add each layer to a new map pane, to control z-index ordering
        this.map.createPane('walk_pane');
        this.map.getPane('walk_pane').style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.walkLayer = new L.GeoJSON.AJAX(url, {
            style: () => ({
                color: "#2a93ee",
                weight: 5,
                fillOpacity: 0.5,
                opacity: 0.7,
                dashArray: '5, 10'
            }),
            pane: 'walk_pane'
        });

        this.walkLayer.addTo(this.map);

    }

     // create and add GeoJSON walk mask layer to obscure areas outside city centre
    loadMaskLayer() {

        const url="./mask.geojson";

        // add each layer to a new map pane, to control z-index ordering
        this.map.createPane('mask_pane');
        this.map.getPane('mask_pane').style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.walkLayer = new L.GeoJSON.AJAX(url, {
            style: () => ({
                color: "white",
                weight: 1,
                fillOpacity: 1.0,
                opacity: 1.0
            }),
            pane: 'mask_pane'
        });

        this.walkLayer.addTo(this.map);

    }   

    // create and add GeoJSON sight markers
    loadSightMarkers() {

        const url = this.sightMarkersUrl;
        const nextLayerIndex = this.mapLayers.length;

        // create pane for user location marker first, to ensure it appears below sight markers
        var paneName = 'location_pane';
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 300;

        // add each layer to a new map pane, to control z-index ordering
        paneName = `pane${nextLayerIndex}`;
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.mapLayers[nextLayerIndex] = new L.GeoJSON.AJAX(url, {
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

        this.mapLayers[nextLayerIndex].addTo(this.map);

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
                <p><a href="${props['SightUrl']}" target="_blank">Open Website &nearr;</a></p>
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

        this.map.addEventListener('zoomstart, movestart', (e) => {
            this.map.getPane('basemap_pane').style.display='none';
        });

        this.map.addEventListener('zoomend, moveend', (e) =>     {
            this.map.getPane('basemap_pane').style.display='block';
        });
    }

    // trigger a request to determine user's current location
    locateUser() {
        this.locationControl.start();
    }

    handleZoomAndPanEvents() {
        this.map.on('zoomstart', function(event) {
            if (this.map) {
                console.log('Zoom is about to change');
                console.log('Current zoom level:', this.map.getZoom());
            }        
        });
    }
}

// init the app
const myMapApp = new MapApp();
myMapApp.init();