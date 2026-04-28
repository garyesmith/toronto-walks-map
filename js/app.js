class MapApp {

    constructor() {

        // global references
        this.sightsList = document.getElementById('sights');
        this.mapDiv = document.getElementById('map');
        this.aboutDiv = document.getElementById('about-content');
        this.infoScrollObserver;
        this.map;
        this.mapLayers = [];
        this.mapMarkersLayer;
        this.walkLayer;
        this.mapMarkerObjects = []; 
        this.mapMarkerGroup;
        this.infoElements = []; 
        this.mapElements = []; 
        this.sightContent;
        this.resizingTimeout=0;

        // set min zoom amount based on screen size
        this.minZoom=15;
        if (window.innerWidth<1024) {
            this.minZoom=14;
        }

        // initial map configs
        this.canvasRenderer = L.canvas({ padding: 0.5}); // buffers 0.5 of the map outside view
        this.mapInitialCenter=[43.6542251, -79.3723956];
        this.mapInitialZoom=15;
        this.mapBounds = L.latLngBounds([[43.6087473, -79.4043939], [43.6677615, -79.3401475]]);

        // map layer configs
        this.layerConfigs = [
            ["json/dissolved/green_spaces.geojson", "#adc57b", 1],
            ["json/dissolved/sidewalks.geojson", "#999999", 1],
            ["json/dissolved/water.geojson", "#91cbef", 1],
            ["json/dissolved/buildings.geojson", "#d0b38f", 1]
        ];

        // json config file URLs
        this.jsonUrls = {
            "sightMarkers": "json/points.geojson",
            "sightContent": "json/sights.json",
            "walksContent": "json/walks.json"
        };

        // default map marker style
        this.mapMarker = L.ExtraMarkers.icon({
            markerColor: 'cyan',
            shape: 'circle',
            prefix: 'fa',
            shadowSize: [0,0]
        });

        // selected map marker style
        this.selectedMapMarker = L.ExtraMarkers.icon({
            markerColor: 'orange',
            shape: 'circle',
            prefix: 'fa',
            shadowSize: [0,0]
        });

        this.currWalkNumber = 1;

    }

    init() {
        this.setupMap();
        this.loadMapFeatureLayers();
        this.loadCurrentWalkLayer();
        this.addBasemapLayer();
        this.loadWalkContent();   
        this.handleWindowResizing();
        this.bindAboutPageEvents();
        this.locateUser();
    }

    // initialize the map
    setupMap() {
        this.map = L.map('map', {
            preferCanvas: true,
            center: this.mapInitialCenter,
            maxBounds: this.mapBounds,
            maxBoundsViscosity: 1.0,
            zoom: this.mapInitialZoom,
            minZoom: this.minZoom,
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

        // workaround for a leaflet bug that causes click handler problems after map drag
        this.map.on('dragend', () => {
            this.map.dragging.disable();
            setTimeout(() => {
                this.map.dragging.enable();
            }, 250);
        });

    }

    // load and add geoJson map layers (water, sidewalks, green spaces, buildings)
    async loadMapFeatureLayers() {
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

    // add base tile map layer
    addBasemapLayer() {
        this.map.createPane('basemap_pane');
        this.map.getPane('basemap_pane').style.zIndex = 400;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 17,
            updateWhenZooming: false,
            pane: 'basemap_pane',
            edgeBufferTiles: 2
        }).addTo(this.map);
    }

    // create and add GeoJSON walk path layers
    loadCurrentWalkLayer() {

        const url="json/walks/walk" + this.currWalkNumber + ".geojson";

        const paneName='walk_pane';

        // if the walk pane already exists from a previous walk, delete it first
        if (this.map.getPane(paneName)) {
            this.map.removeLayer(this.walkLayer);
            delete this.walkLayer;
            L.DomUtil.remove(paneName);
            delete this.map._panes[paneName];
            delete this.map._paneRenderers[paneName];
        }
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.walkLayer = new L.GeoJSON.AJAX(url, {
            style: () => ({
                color: "#2a93ee",
                weight: 7,
                fillOpacity: 0.5,
                opacity: 0.7,
                dashArray: '5, 10'
            }),
            pane: paneName
        });

        this.walkLayer.addTo(this.map);

    }

    // add GeoJSON sight markers for the current walk to the map
    renderSightMarkers() {

        const url = this.jsonUrls.sightMarkers;
        const nextLayerIndex = this.mapLayers.length;

        // define a new pane for this layer
        var paneName = 'location_pane';

        // remove any existing markers on the pane
        this.map.eachLayer((layer) => {
            if (layer instanceof L.Marker && layer.options.pane === paneName) {
                this.map.removeLayer(layer);
                delete this.mapMarkersLayer;
                L.DomUtil.remove(paneName);
                delete this.map._panes[paneName];
                delete this.map._paneRenderers[paneName];
            }
        });

        // create a new pane for the sight markers, if it does not already exist
        if (!this.map.getPane(paneName)) {
            this.map.createPane(paneName);
            this.map.getPane(paneName).style.zIndex = 400;
        }

        this.populateWalkIntro();

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        // only render markers that are part of the current walk
        // use className option to assign a unique class to markers so they can be referenced individually later
        if (this.mapMarkerGroup) {
            this.map.removeLayer(this.mapMarkerGroup);
        }
        this.mapMarkerGroup = L.featureGroup().addTo(this.map);
        this.mapMarkersLayer = new L.GeoJSON.AJAX(url, {
            pointToLayer: (feature, latlng) => { 
                if (this.walksContent.get(this.currWalkNumber).sights.includes(feature.properties['slug'])) {
                    this.mapMarker.options.className = 'sight-'+feature.properties['slug'];
                    var newMarker=L.marker(latlng, {
                        icon: this.mapMarker,
                        pane: paneName,
                    });
                    this.mapMarkerGroup.addLayer(newMarker);
                    this.mapMarkerObjects.push(newMarker);
                    return newMarker;
                }
            }, 
            onEachFeature: (feature, layer) => {
                if (this.walksContent.get(this.currWalkNumber).sights.includes(feature.properties['slug'])) {
                    layer.on('click', (e) => {
                        this.handleMapMarkerClick(feature, e);
                    });
                    this.addSightToInfoBar(feature);
                }
            }
        });
        this.mapMarkersLayer.addTo(this.map);

        // when all markers above are loaded, re-cache the rendered page elements and (re)initialize the 
        // intersection observer to highlight markers as they are scrolled past in the info pane
        this.mapMarkersLayer.on('data:loaded', (e) => {
            this.infoElements=[];
            this.mapElements=[];
            this.cacheDomQueries();
            this.startInfoScrollObserver();
            this.bindPhotoCreditLinks();
            this.map.invalidateSize();
            this.map.fitBounds(this.mapMarkerGroup.getBounds(), { padding: [30, 30] }); // zoom and center map markers for the walk
            this.addWhatNextBox();
        });

    }

    // add the 'what next' box at the end of the walk info 
    addWhatNextBox() {
        const walk=this.walksContent.get(this.currWalkNumber);
        if (walk.next && walk.next.length) {
            var nextDiv = document.createElement('div');
            nextDiv.id='what-next';
            nextDiv.innerHTML= `<p><b>Where to next?</b> ${walk.next}</p>`;
            this.sightsList.appendChild(nextDiv);
        }
    }

    // load content that defines walk routes from walks.json
    async loadWalkContent() {
        try {
            const response = await fetch(this.jsonUrls.walksContent);
            if (!response.ok) throw new Error('File not found');
            const walksArray = await response.json(); 
            this.walksContent = new Map(walksArray.map(walk => [walk.id, walk]));
            this.populateWalkSelect();
            this.loadSightContent(); 
            
        } catch (error) {
            console.error('Error loading JSON:', error);
        }
    }

    // add information about current walk to top of info sidebar
    populateWalkIntro() {
        const walk=this.walksContent.get(this.currWalkNumber);
        var walkMetaHtml=this.getWalkMetaHtml(walk);
        var walkIntroDiv=document.createElement('div');
        walkIntroDiv.innerHTML=walkMetaHtml;
        walkIntroDiv.setAttribute('id', "walk-intro");
        walkIntroDiv.classList.add("marker-box");
        document.getElementById('sights').appendChild(walkIntroDiv);
    }

    // get formatted walk description
    getWalkMetaHtml(walk, includeSummary=true) {
        var walkMetaHtml=`
            <h3 id="walk-intro-heading">${walk.name} Walk</h3>
            <p class="distance">${walk.km} km &bull; Approx`;
            if (walk.hours!="0") {
                walkMetaHtml+=` ${walk.hours} hour`;
                if (parseInt(walk.hours,10)>1) {
                    walkMetaHtml+=`s`;
                }
            }
            if (walk.mins!="0") {
                walkMetaHtml+=` ${walk.mins} mins`;
            }
            if (includeSummary) {
                walkMetaHtml+=`</p>
                <p class="summary">${walk.summary}</p>`;
            }
        return walkMetaHtml;
    }

    // populate the select at the top of the sidebar with loaded walk names and IDs
    populateWalkSelect() {
        document.getElementById('this-walk').innerHTML = '<span id=\"this-walk-name\">' + this.walksContent.get(this.currWalkNumber).name + "</span> Walk <span id=\"walk-down\">&dtrif;</span><span id=\"walk-up\">&utrif;</span>";
        this.walksContent.forEach(walk => {
            var option = document.createElement('li');
            option.setAttribute('data-value', walk.id);
            var walkMetaHtml = `<img src="images/${walk.thumb}" alt="${walk.name}" />`;
            walkMetaHtml+=this.getWalkMetaHtml(walk, false);
            option.innerHTML=walkMetaHtml;
            document.getElementById('walk-list').appendChild(option);
            document.getElementById('walk-list').addEventListener('click', (e) => {
                const walkId = parseInt(e.target.closest('li').getAttribute("data-value", 10));
                if (this.currWalkNumber != walkId) {
                    this.currWalkNumber=walkId;
                    document.getElementById('this-walk-name').click();
                    document.getElementById('this-walk-name').innerText=this.walksContent.get(walkId).name;
                    this.loadCurrentWalkLayer();
                    this.sightsList.innerHTML="";
                    this.renderSightMarkers();
                }
            });
        });
        var option = document.createElement('li');
        document.getElementById('walk-list').appendChild(option);
        this.bindWalkSelectClickHandler();
    }

    // open or close walk list when walk name is clicked
    bindWalkSelectClickHandler() {
        document.getElementById('this-walk').addEventListener('click', (e) => {
                var walkList=document.getElementById('walk-list');
                if (walkList.style.maxHeight != "0px") {
                    walkList.style.maxHeight="0px";
                    walkList.style.overflowY="hidden";
                    document.getElementById('walk-up').style.display='none';
                    document.getElementById('walk-down').style.display='inline-block';
                    document.getElementById('close').style.display='none';
                } else {
                    walkList.style.maxHeight="1200px";
                    document.querySelectorAll('#walk-list li').forEach((item) => {
                        if (item.getAttribute('data-value')==this.currWalkNumber) {
                            item.classList.add("current");
                        } else {
                            item.classList.remove("current");
                        }
                    });
                    setTimeout(() => {
                        walkList.style.overflowY="scroll";
                    }, 750);
                    document.getElementById('walk-down').style.display='none';
                    document.getElementById('walk-up').style.display='inline-block';
                    document.getElementById('close').style.display='block';
                    document.getElementById('close').addEventListener('click', (e) => {
                        document.getElementById('this-walk').click();
                    }, { once: true });
                }
        });
        document.getElementById('walk-list').style.maxHeight="0px"; // set default state
    }

    // load content that describes sight points from sights.json
    async loadSightContent() {
        try {
            const response = await fetch(this.jsonUrls.sightContent);
            if (!response.ok) throw new Error('File not found');
            const sightArray = await response.json(); 
            this.sightContent = new Map(sightArray.map(sight => [sight.slug, sight]));
            this.renderSightMarkers();
        } catch (error) {
            console.error('Error loading JSON:', error);
        }
    }

    addSightToInfoBar(feature) {
        if (typeof feature.properties.slug != "undefined" && feature.properties.slug.length) {
            const sight = this.sightContent.get(feature.properties.slug);
            const sightIndex = this.walksContent.get(this.currWalkNumber).sights.indexOf(feature.properties.slug);
            var infoHtml = `
                    <div class="marker-line">
                        <div class="info-marker marker-${sight.slug} leaflet-marker-icon extra-marker extra-marker-circle-cyan"></div>
                    </div>
                    <div class="marker-meta">
                        <h2 class="info-header" id="sight-${sight.slug}">${sight.name}</h2>
                            <figure>
                                <img src="./images/${sight.slug}.jpg" alt="${sight.name}" />`;

            if (sight.photoLicense) {
                infoHtml +=`    <figcaption class="credit">Photo ${sight.photoLicense} by <nobr><a href="${sight.photoUrl}" target="_blank">${sight.photoName}</a>&nbsp;&nearr;</nobr></figcaption>
                                <a class="show-credit"></a>`;
            }

            infoHtml+=`     </figure>
                            <p>${sight.details}</p>`;
            if (sight.note && sight.note.length) {
                infoHtml+=`<p class="note">${sight.note}</p>`;
            }
            infoHtml+=`</div>`;

            var markerDiv = document.createElement('div');
            markerDiv.className='marker-box';
            markerDiv.setAttribute('data-index', sightIndex);
            markerDiv.innerHTML= infoHtml;
            this.sightsList.appendChild(markerDiv);
            var numSights=this.walksContent.get(this.currWalkNumber).sights.length ;
            var numChildren=this.sightsList.childElementCount;
            if (numChildren>numSights) {
                this.sortSightsInInfoBar();
            }
        } else {
            console.error('Unknown slug for sight point:', error);
        }

    }

    // sort marker box elements in the info bar according to the order they appear in the current walk
    sortSightsInInfoBar() {
        var sights = Array.from(this.sightsList.children); 
        sights.sort((a, b) => {
            return Number(Number(a.getAttribute('data-index') - b.getAttribute('data-index')));
        });
        this.sightsList.innerHTML="";
        sights.forEach(sight => this.sightsList.appendChild(sight));
    }

    // show or hide photo credits when provided for an image in the info bar
    bindPhotoCreditLinks() {
        document.querySelectorAll('#sights a.show-credit').forEach((el) => {
            el.addEventListener('click', (e) => {
                var caption = e.target.parentElement.querySelector('figcaption');
                if (caption.style.display=='block') {
                    caption.style.display='none';
                } else {
                    caption.style.display='block';
                }
            });
        });
    }

    // display clicked sight details in info bar, highlight it, and zoom to it
    handleMapMarkerClick(feature, e) {

        // update styles of markers in info pane, to make sure only highlighted one is orange
        this.mapElements.forEach(el => {
            if (el.classList.contains('marker-'+feature.properties['slug'])) {
                el.classList.remove('extra-marker-circle-cyan');
                el.classList.add('extra-marker-circle-orange');
            } else {
                el.classList.remove('extra-marker-circle-orange');
                el.classList.add('extra-marker-circle-cyan');
            }
        });
        
        // if not already at the top, scroll to the associated marker box in info pane
        const child = document.getElementById('sight-'+feature.properties['slug']);
        if (!child.classList.contains('active')) {
            this.infoElements.forEach(el => el.classList.remove('active'));
            child.classList.remove('extra-marker-circle-cyan');
            child.classList.add('extra-marker-circle-orange');
            this.sightsList.scrollTo({
                top: child.offsetTop-80
            });
        }

        // once the info bar scrolling ends, highlight the marker on the map and zoom/scroll to it
        this.selectedMapMarker.options.className = 'sight-'+feature.properties['slug'];
        this.mapMarkerObjects.forEach(marker => {
            this.mapMarker.options.className = 'sight-'+marker.feature.properties['slug'];
            if (marker.feature.properties['slug']==feature.properties['slug']) {
                marker.setIcon(this.selectedMapMarker);
            } else {
                marker.setIcon(this.mapMarker);
            }
        });
        this.map.invalidateSize();
        this.map.setView(e.target.getLatLng(), 17);

    }

    // when window resizes, reset the map and adjust heights on a few other elements
    handleWindowResizing() {
        window.addEventListener('resize', () => {
            clearTimeout(this.resizingTimeout);
            this.resizingTimeout=setTimeout(() => {

                // adjust minzoom based on screen width
                this.minZoom=15;
                if (window.innerWidth<1024) {
                    this.minZoom=14;
                }
                this.map.setMinZoom(this.minZoom);
                //var infoHeight=document.getElementById('info').getBoundingClientRect().height;
                if (this.map) {
                    this.map.invalidateSize();
                    //this.map.setView(this.mapInitialCenter, this.mapInitialZoom);
                    this.map.fitBounds(this.mapMarkerGroup.getBounds(), { padding: [30, 30] }); 
                }
            }, 300);
        });
    }

    // display 'about this app' page when info icon clicked
    bindAboutPageEvents() {
        document.getElementById('about').addEventListener('click', (e) => {
            this.aboutDiv.style.display='block';
            this.aboutDiv.scrollTop = 0;
            document.getElementById('about-close').addEventListener('click', (e) => {
                this.aboutDiv.style.display='none';
            }, { once: true });
        });
    }

    // trigger a request to determine user's current location on the emap
    locateUser() {
        this.locationControl.start();
    }

    // run a few DOM queries only once and store element references
    cacheDomQueries() {
        
        // pre-query information box elements for future references
        if (!this.infoElements.length) {
            this.infoElements = document.querySelectorAll('#walk-intro h3, #sights .marker-box .marker-meta h2');
            if (!this.infoElements.length) {
                setTimeout(() => {
                    this.cacheDomQueries();
                }, 100);
                return;
            }
        }

        // pre-query map marker elements for future references
        if (!this.mapElements.length) {
            this.mapElements = document.querySelectorAll('.leaflet-marker-icon');
            if (!this.mapElements.length) {
                setTimeout(() => {
                    this.cacheDomQueries();
                }, 100);
                return;
            }
        }

    }

    // when a sight info box scrolls into the top area of its parent div, highlight it there and on the map
    infoScrollObserverCallback = (entries) => {
        if (!this.mapElements.length) return;
        entries.forEach((entry) => {
            const child = entry.target;
            const childId = child.id;
            if (entry.isIntersecting && !child.classList.contains('active')) {
                child.classList.add('active');
                if (child.id=='walk-intro-heading') { // when scrolled all the way up, zoom and center map markers for the walk
                    this.map.invalidateSize();
                    this.map.fitBounds(this.mapMarkerGroup.getBounds(), { padding: [30, 30] }); 
                } else {
                    const markerToClick = document.querySelector('.leaflet-location_pane-pane .' + childId);
                    if (markerToClick)  { 
                        markerToClick.click();
                    }
                }
            } else if (!entry.isIntersecting) {
                child.classList.remove('active');  
            }
        });
    };

    // when a sight info box scrolls to the area near the top, highlight the relevant marker
    // on the map and zoom/scroll to it
    startInfoScrollObserver() {
        if (this.infoScrollObserver) this.infoScrollObserver.disconnect();
        this.infoScrollObserver = new IntersectionObserver(this.infoScrollObserverCallback, {
            root: this.sightsList,
            rootMargin: '-3% 0px -85% 0px',
            threshold: 0
        });
        this.infoElements.forEach(child =>  this.infoScrollObserver.observe(child));
    }

}

const app = new MapApp();
app.init();