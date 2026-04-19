class MapApp {

    constructor() {

        // local properties (state)
        this.map = null;
        this.infoDiv = document.getElementById('info');
        this.mapLayers = [];
        this.walkLayer = null;
        this.scrollObserver;
        this.canvasRenderer = L.canvas({ padding: 0.5});
        
        // config (json file, color, weight)
        this.layerConfigs = [
            ["./json/dissolved/green_spaces_dissolved.json", "#adc57b", 1],
            ["./json/dissolved/sidewalks_dissolved.json", "#999999", 1],
            ["./json/dissolved/water_dissolved.json", "#91cbef", 1],
            ["./json/dissolved/buildings_dissolved.json", "#d0b38f", 1]
        ];

        this.mapMarker = L.ExtraMarkers.icon({
            markerColor: 'cyan',
            shape: 'circle',
            prefix: 'fa'
        });

        this.selectedMapMarker = L.ExtraMarkers.icon({
            markerColor: 'orange',
            shape: 'circle',
            prefix: 'fa'
        });

        this.sightMarkersUrl = "./json/points.json";

        this.markers = [];
        this.markerLookup = new Map();
        this.infoElements = [];
        this.mapElements = [];

        this.currWalkNumber = 1

        this.infoDiv.style.height = window.innerHeight + 'px';
        
    }

    init() {
        this.setupMap();
        this.loadMapLayers();
        this.addTileLayer();
        this.loadWalkLayer(this.currWalkNumber);
        this.loadSightMarkers();
        this.bindGlobalEvents();
        this.locateUser();
        this.storeDomQueryReferences();
    }

    // init map
    setupMap() {
        var bounds = L.latLngBounds([[43.6246868, -79.3998917], [43.6634737, -79.3446790 ]]);
        this.map = L.map('map', {
            preferCanvas: true,
            center: [43.6425099, -79.3745239],
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            zoom: 15,
            minZoom: 15,
            maxZoom: 17
        });
        this.locationControl = L.control.locate({
            position: "topleft",
            strings: {
                title: "Locate me"
            },
            keepCurrentZoomLevel: [15, 17],
            clickBehavior: {
                inView: 'setView', 
                outOfView: 'setView', 
                inViewNotFollowing: 'setView'
            },
            setView: false
        }).addTo(this.map);

    }

    // load and add geoJson map layers
    async loadMapLayers() {
        this.map.createPane('layers_pane');
        this.map.getPane('layers_pane').style.zIndex = 200;
        const layerPromises = this.layerConfigs.map(async ([url, color, weight]) => {
            const response = await fetch(url);
            const data = await response.json();
            return L.geoJSON(data, {
                style: { color, weight, fillOpacity: 0.5, opacity: 0.7 },
                pane: 'layers_pane',
                renderer: this.canvasRenderer
            }).addTo(this.map);
        });

        this.mapLayers = await Promise.all(layerPromises);
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
            pane: 'basemap_pane',
            edgeBufferTiles: 2
        }).addTo(this.map);
    }

    // create and add GeoJSON walk path layers
    loadWalkLayer(walkNumber) {

        const url="./json/walks/walk" + walkNumber + ".json";

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

    // create and add GeoJSON sight markers
    loadSightMarkers() {

        const url = this.sightMarkersUrl;
        const nextLayerIndex = this.mapLayers.length;

        // create pane for user location marker first, to ensure it appears below sight markers
        var paneName = 'location_pane';
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        // use className option to assign a unique class to markers so they can be referenced individually later
        this.mapLayers[nextLayerIndex] = new L.GeoJSON.AJAX(url, {
            pointToLayer: (feature, latlng) => { 
                this.mapMarker.options.className = 'sight-'+feature.properties['OBJECTID'];
                var newMarker=L.marker(latlng, {
                    icon: this.mapMarker,
                    pane: paneName,
                });
                this.markers.push(newMarker);
                return newMarker;
            }, 
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    this.handleMapMarkerClick(feature, e);
                });
                this.addSightToInfoBar(feature);
            }
        });
        this.mapLayers[nextLayerIndex].addTo(this.map);

    }

    addSightToInfoBar(feature) {
        const props = feature.properties;
        var infoHtml = `
                <div class="marker-line">
                    <div class="marker-${feature.properties['OBJECTID']} leaflet-marker-icon extra-marker extra-marker-circle-cyan"></div>
                </div>
                <div class="marker-meta">
                    <h2 id="sight-${feature.properties['OBJECTID']}">${props['SightName']}</h2>
                    <p>
                        <img src="./images/${props['SightImage']}" alt="${props['SightName']}" />
                        ${props['SightDesc']}
                    </p>
                </div>
        `;
        var markerDiv = document.createElement('div');
        //markerDiv.id="sight-"+feature.properties['OBJECTID'];
        markerDiv.className='marker-box';
        markerDiv.innerHTML= infoHtml;
        document.getElementById("info").appendChild(markerDiv);

    }

    // display clicked sight details in info bar, highlight it, and zoom to it
    handleMapMarkerClick(feature, e) {

        // update styles of markers in info pane, to make sure only highlighted one is orange
        this.mapElements.forEach(el => {
            if (el.classList.contains('marker-'+feature.properties['OBJECTID'])) {
                el.classList.remove('extra-marker-circle-cyan');
                el.classList.add('extra-marker-circle-orange');
            } else {
                el.classList.remove('extra-marker-circle-orange');
                el.classList.add('extra-marker-circle-cyan');
            }
        });
        
        // if not already at the top, scroll to the associated marker box in info pane
        const child = document.getElementById('sight-'+feature.properties['OBJECTID']);
        if (!child.classList.contains('active')) {
            this.infoElements.forEach(el => el.classList.remove('active'));
            child.classList.add('active');
            this.infoDiv.scrollTo({
                top: child.offsetTop-32
            });
        }

        // once the info bar scrolling ends, highlight the marker on the map and zoom/scroll to it
        this.infoDiv.addEventListener('scrollend', () => {
            this.selectedMapMarker.options.className = feature.properties['OBJECTID'];
            this.markers.forEach(marker => {
                this.mapMarker.options.className = 'sight-'+marker.feature.properties['OBJECTID'];
                if (marker.feature.properties['OBJECTID']==feature.properties['OBJECTID']) {
                    marker.setIcon(this.selectedMapMarker);
                } else {
                    marker.setIcon(this.mapMarker);
                }
            });
            this.map.setView(e.target.getLatLng(), 16);
        }, { once: true });

    }

    // handle global window events
    bindGlobalEvents() {

        // reset map size on window resize
        window.addEventListener('resize', () => {
            this.infoDiv.style.height = window.innerHeight + 'px';
            if (this.map) this.map.invalidateSize();
        });
    }

    // trigger a request to determine user's current location
    locateUser() {
        this.locationControl.start();
    }

    // run DOM queries only once and store references
    storeDomQueryReferences() {
        
        // pre-query information box elements for future references
        if (!this.infoElements.length) {
            this.infoElements = document.querySelectorAll('#info .marker-box .marker-meta h2');
            if (!this.infoElements.length) {
                setTimeout(() => {
                    this.storeDomQueryReferences();
                }, 100);
                return;
            }
        }

        // pre-query map marker elements for future references
        if (!this.mapElements.length) {
            this.mapElements = document.querySelectorAll('.leaflet-marker-icon');
            if (!this.mapElements.length) {
                setTimeout(() => {
                    this.storeDomQueryReferences();
                }, 100);
                return;
            }
        }

        // only initialize info panel scroll interection observer once all required
        // elements are rendered into the DOM and pre-queried
        this.initSightscrollObserver();

    }

    // when a sight info box scrolls to the area near the top, highlight the relevant marker
    // on the map and zoom/scroll to it
    initSightscrollObserver() {

        const parent = this.infoDiv;

        const observerOptions = {
            root: parent,
            rootMargin: '2% 0px -80% 0px',
            threshold: 0
        };

        const observerCallback = (entries) => {
            if (!this.mapElements.length) return;
            entries.forEach((entry) => {
                const child = entry.target;
                const childId = child.id;
                for (var i=0; i<this.mapElements.length; i++) {
                    if (this.mapElements[i].classList.contains(childId)) break;
                }
                for (var j=0; j<this.markers; j++) {
                    if (this.markers[j].id=child.id) break;
                }
                if (entry.isIntersecting && !child.classList.contains('active')) {
                    child.classList.add('active');
                    const markerToClick = document.querySelector('.leaflet-location_pane-pane .' + childId);
                    if (markerToClick) markerToClick.click();
                } else if (!entry.isIntersecting) {
                    child.classList.remove('active');
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Start observing each child
        this.infoElements.forEach(child => observer.observe(child));

    }

}

// init the app
const myMapApp = new MapApp();
myMapApp.init();