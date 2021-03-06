/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * 'License'); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

module.exports = function(messages) {
    var constants = require('sim-constants'),
        geo       = require('./geo-model'),
        db        = require('db'),
        event     = require('event'),
        utils     = require('utils'),
        _gpsMapZoomLevel;

    geo.initialize(messages);

    function _updateGpsMap() {
        var positionInfo = geo.getPositionInfo(),
            mapContainer = document.getElementById(constants.GEO.OPTIONS.MAP_CONTAINER),
            geoZoomValue = document.getElementById(constants.GEO.MAP_ZOOM_LEVEL_CONTAINER);

        if (mapContainer) {
            geo.map.setCenter(new OpenLayers.LonLat(positionInfo.longitude, positionInfo.latitude) // Center of the map
                    .transform(
                    new OpenLayers.Projection('EPSG:4326'), // transform from WGS 1984
                    new OpenLayers.Projection('EPSG:900913') // to Spherical Mercator Projection
                ),
                _gpsMapZoomLevel,
                true // don't trigger dragging events
            );
        }

        if (geoZoomValue) {
            geoZoomValue.innerHTML = _gpsMapZoomLevel;
        }
    }

    function _updateGpsMapZoom(goUp) {
        var inc = goUp? 1 : -1;
        _gpsMapZoomSet(_gpsMapZoomLevel + inc);
        _updateGpsMap();
    }

    function _gpsMapZoomSet(value) {
        _gpsMapZoomLevel = Math.max(Math.min(value, constants.GEO.MAP_ZOOM_MAX), constants.GEO.MAP_ZOOM_MIN);
        document.getElementById(constants.GEO.MAP_ZOOM_LEVEL_CONTAINER).innerHTML = _gpsMapZoomLevel;
        db.save(constants.GEO.MAP_ZOOM_KEY, _gpsMapZoomLevel);
    }

    function _getTextHeading(heading) {
        if (heading >= 337.5 || (heading >= 0 && heading <= 22.5)) {
            return 'N';
        }

        if (heading >= 22.5 && heading <= 67.5) {
            return 'NE';
        }

        if (heading >= 67.5 && heading <= 112.5) {
            return 'E';
        }
        if (heading >= 112.5 && heading <= 157.5) {
            return 'SE';
        }

        if (heading >= 157.5 && heading <= 202.5) {
            return 'S';
        }

        if (heading >= 202.5 && heading <= 247.5) {
            return 'SW';
        }

        if (heading >= 247.5 && heading <= 292.5) {
            return 'W';
        }

        if (heading >= 292.5 && heading <= 337.5) {
            return 'NW';
        }
    }

    return {
        panel: {
            domId: 'gps-container',
            collapsed: true,
            pane: 'right'
        },

        initialize: function () {
            var GEO_OPTIONS            = constants.GEO.OPTIONS,
                positionInfo           = geo.getPositionInfo(),
                positionUpdatedMessage = 'position-info-updated',
                latitude               = document.getElementById(GEO_OPTIONS.LATITUDE),
                longitude              = document.getElementById(GEO_OPTIONS.LONGITUDE),
                altitude               = document.getElementById(GEO_OPTIONS.ALTITUDE),
                accuracy               = document.getElementById(GEO_OPTIONS.ACCURACY),
                altitudeAccuracy       = document.getElementById(GEO_OPTIONS.ALTITUDE_ACCURACY),
                heading                = document.getElementById(GEO_OPTIONS.HEADING),
                speed                  = document.getElementById(GEO_OPTIONS.SPEED),
                delay                  = document.getElementById(GEO_OPTIONS.DELAY),
                delayLabel             = document.getElementById(GEO_OPTIONS.DELAY_LABEL),
                headingLabel           = document.getElementById(GEO_OPTIONS.HEADING_LABEL),
                headingMapLabel        = document.getElementById(GEO_OPTIONS.HEADING_MAP_LABEL),
                timeout                = document.getElementById(GEO_OPTIONS.TIMEOUT),
                gpxMultiplier          = document.getElementById(GEO_OPTIONS.GPXMULTIPLIER),
                gpxReplayStatus        = document.getElementById(GEO_OPTIONS.GPXREPLAYSTATUS),
                gpxGo                  = document.getElementById(GEO_OPTIONS.GPXGO),
                mapMarker              = document.getElementById(GEO_OPTIONS.MAP_MARKER),
                mapContainer           = document.getElementById(GEO_OPTIONS.MAP_CONTAINER),
                map                    = null,
                track                  = [],
                _replayingGpxFile      = false,
                _haltGpxReplay    = false;

            var updateGeoPending = false;
            function updateGeo() {
                if (!updateGeoPending) {
                    updateGeoPending = true;
                    window.setTimeout(function () {
                        geo.updatePositionInfo({
                                latitude: parseFloat(latitude.value),
                                longitude: parseFloat(longitude.value),
                                altitude: parseInt(altitude.value, 10),
                                accuracy: parseInt(accuracy.value, 10),
                                altitudeAccuracy: parseInt(altitudeAccuracy.value, 10),
                                heading: heading.value ? parseFloat(heading.value) : 0, // HACK: see techdebt http://www.pivotaltracker.com/story/show/5478847
                                speed: speed.value ? parseInt(speed.value, 10) : 0, // HACK: see techdebt http://www.pivotaltracker.com/story/show/5478847
                                timeStamp: new Date()
                            },
                            delay.value,
                            timeout.checked);
                        updateGeoPending = false;
                    }, 0);
                }
            }

            function updateHeadingValues() {
                var headingDeg  = parseFloat(heading.value),
                    headingText = _getTextHeading(parseFloat(heading.value));

                headingLabel.textContent = headingText;
                headingMapLabel.innerHTML = headingText + '</br>' + headingDeg + '&deg;';

                var style = ['-webkit-transform', '-ms-transform', '-moz-transform', '-o-transform', 'transform'].map(function (prop) {
                    return prop + ': rotate(' + headingDeg + 'deg);';
                }).join(' ');
                mapMarker.setAttribute('style', style);
            }

            function updateValsFromMap() {
                var center = geo.map.getCenter().transform(
                    new OpenLayers.Projection('EPSG:900913'),
                    new OpenLayers.Projection('EPSG:4326'));
                longitude.value = center.lon;
                latitude.value = center.lat;

                _gpsMapZoomSet(geo.map.zoom);
                updateGeo();
            }

            function initializeValues() {
                latitude.value = positionInfo.latitude;
                longitude.value = positionInfo.longitude;
                altitude.value = positionInfo.altitude;
                accuracy.value = positionInfo.accuracy;
                altitudeAccuracy.value = positionInfo.altitudeAccuracy;

                delay.value = document.getElementById(GEO_OPTIONS.DELAY_LABEL).textContent = geo.delay || 0;
                if (geo.timeout) {
                    timeout.checked = true;
                }
                updateHeadingValues();
            }

            function initMap() {
                // override image location so we don't have to include image assets
                OpenLayers.ImgPath = 'http://openlayers.org/api/img/';

                // init map
                geo.map = new OpenLayers.Map(mapContainer, {controls: [], theme: null});

                // add controls and OSM map layer
                geo.map.addLayer(new OpenLayers.Layer.OSM());
                geo.map.addControl(new OpenLayers.Control.Navigation());

                // override behaviour of click to pan and double click to zoom in
                var clickHandler = new OpenLayers.Handler.Click(
                    this,
                    {
                        click: function (e) {
                            var lonlat = geo.map.getLonLatFromViewPortPx(e.xy);
                            geo.map.panTo(new OpenLayers.LonLat(lonlat.lon, lonlat.lat), _gpsMapZoomLevel);
                        },

                        dblclick: function () {
                            _updateGpsMapZoom(true);
                        }
                    },
                    {double: true}
                );

                // add click handler to map
                clickHandler.setMap(geo.map);
                clickHandler.activate();

                // update long and lat when map is panned
                geo.map.events.register('moveend', map, function () {
                    updateValsFromMap();
                });

                event.on('ApplicationState', function (obj) {
                    if (obj && obj[0].id === 'gps-container' && obj.hasClass('ui-box-open')) {
                        _updateGpsMap();
                    }
                });
            }

            function loadGpxFile(filename) {
                var reader        = new FileReader(),
                    _xml,
                    t,
                    att,
                    lastAtt,
                    _ele,
                    _timestamp,
                    _lastTimestamp,
                    _useTimestamp = new Date().getTime(),
                    _tempTimestamp,
                    _tempPosition,
                    _lastPosition,
                    _useLastTimestamp,
                    _heading      = 0,
                    _speed        = 0,
                    _dist         = 0,
                    navUtils      = new utils.navHelper();

                reader.onload = function (e) {
                    function parseXml(xml) {
                        return new DOMParser().parseFromString(xml, "text/xml");
                    }

                    t = parseXml(e.target.result).querySelectorAll('trkpt');

                    track = [];

                    utils.forEach(t, function (p, i) {
                        if (!isNaN(i)) {
                            att = t[i].attributes;
                            _ele = t[i].querySelectorAll('ele')[0];
                            _timestamp = t[i].querySelectorAll('time')[0];

                            if (_timestamp) {
                                //files recorded with endomondo and others have timestamps, this is not a route plan but a record of a track
                                _useTimestamp = new Date(_timestamp.innerHTML).getTime();
                            }

                            if (t[i - 1]) {
                                lastAtt = t[i - 1].attributes;
                                _lastTimestamp = t[i - 1].querySelectorAll('time')[0];

                                _dist = navUtils.getDistance(att['lat'].value, att['lon'].value, lastAtt['lat'].value, lastAtt['lon'].value);

                                if (_lastTimestamp) {
                                    _useLastTimestamp = new Date(_lastTimestamp.innerHTML).getTime();
                                }
                                else {
                                    //routes from YOURS come in as tracks (rather than routes under the GPX schema), but with no timestamps.  This is a route.
                                    _useLastTimestamp = _useTimestamp;
                                    _useTimestamp += Math.round(_dist / 22.2222 * 1000);  //80km/h in m/s
                                }

                                _heading = navUtils.getHeading(lastAtt['lat'].value, lastAtt['lon'].value, att['lat'].value, att['lon'].value);
                                _speed = (_dist / ((_useTimestamp - _useLastTimestamp) / 1000)).toFixed(2);

                                if (!_lastTimestamp) {
                                    //on YOURS routes, make sure we have at least one update a second
                                    _tempTimestamp = _useLastTimestamp;

                                    while (_useTimestamp - _tempTimestamp > 1000) {
                                        _tempTimestamp += 1000;
                                        _lastPosition = track[track.length - 1].coords;
                                        _tempPosition = navUtils.simulateTravel(_lastPosition.latitude, _lastPosition.longitude, _heading, _speed);
                                        track.push({
                                            coords: {
                                                latitude: _tempPosition.latitude,
                                                longitude: _tempPosition.longitude,
                                                altitude: _ele ? _ele.innerHTML : 0,
                                                accuracy: 150,
                                                altitudeAccuracy: 80,
                                                heading: _heading,
                                                speed: _speed
                                            },
                                            timestamp: _tempTimestamp
                                        });
                                    }
                                }
                            }

                            track.push({
                                coords: {
                                    latitude: att.lat.value,
                                    longitude: att.lon.value,
                                    altitude: _ele ? _ele.innerHTML : 0,
                                    accuracy: 150,
                                    altitudeAccuracy: 80,
                                    heading: _heading,
                                    speed: _speed
                                },
                                timestamp: _useTimestamp
                            });
                        }
                    });
                };
                reader.onerror = function (e) {
                    console.log('Error reading gpx file ' + filename + ': ' + e);
                };
                reader.readAsText(filename, 'UTF-8');
            }

            function replayGpxTrack() {
                if (_replayingGpxFile) {
                    _haltGpxReplay = true;
                    gpxGo.textContent = constants.GEO.GPXGO_LABELS.GO;
                }
                else {
                    if (track.length > 0) {
                        _haltGpxReplay = false;
                        gpxGo.textContent = constants.GEO.GPXGO_LABELS.STOP;

                        latitude.value = track[0].coords.latitude;
                        longitude.value = track[0].coords.longitude;
                        altitude.value = track[0].coords.altitude;
                        accuracy.value = track[0].coords.accuracy;
                        altitudeAccuracy.value = track[0].coords.altitudeAccuracy;
                        heading.value = track[0].coords.heading;
                        speed.value = track[0].coords.speed;

                        updateGeo();
                        updateHeadingValues();

                        moveNextGpxTrack(1);
                    }
                }
            }

            function moveNextGpxTrack(i) {
                if (_haltGpxReplay) {
                    _replayingGpxFile = false;
                    _haltGpxReplay = false;
                    console.log('User interrupted replay of GPX file.');
                }
                else {
                    _replayingGpxFile = true;
                    var _timeMultiplier = !isNaN(gpxMultiplier.value) ? gpxMultiplier.value : 1,
                        _step           = 0,
                        _interval       = 0;

                    while (_interval < 250) {
                        _step++;
                        if ((i + _step) >= track.length) {
                            break;
                        }
                        _interval = (track[i + _step].timestamp - track[i].timestamp) / _timeMultiplier;
                    }

                    gpxReplayStatus.textContent = (_interval / 1000).toFixed(2) + 's (' + (_interval / 1000 * _timeMultiplier).toFixed(2) + 's realtime), ' + (i + 1) + ' of ' + track.length + ' (stepping ' + _step + ' at ' + _timeMultiplier + 'x)';

                    setTimeout(function () {
                        latitude.value = track[i].coords.latitude;
                        longitude.value = track[i].coords.longitude;
                        altitude.value = track[i].coords.altitude;
                        accuracy.value = track[i].coords.accuracy;
                        altitudeAccuracy.value = track[i].coords.altitudeAccuracy;
                        heading.value = track[i].coords.heading;
                        speed.value = track[i].coords.speed;

                        updateGeo();
                        updateHeadingValues();

                        if (track[i + _step]) {
                            moveNextGpxTrack(i + _step);
                        }
                        else {
                            if (i < track.length - 1) {
                                moveNextGpxTrack(track.length - 1);
                            }
                            else {
                                _replayingGpxFile = false;
                                gpxGo.textContent = constants.GEO.GPXGO_LABELS.GO;
                                console.log('Finished replaying GPX file.');
                            }
                        }
                    }, _interval);
                }
            }

            _gpsMapZoomLevel = db.retrieve(constants.GEO.MAP_ZOOM_KEY) || 14;

            document.querySelector('#geo-map-zoom-decrease').addEventListener('click', function () {
                _updateGpsMapZoom(false);
            });
            document.querySelector('#geo-map-zoom-increase').addEventListener('click', function () {
                _updateGpsMapZoom(true);
            });

            utils.bindAutoSaveEvent('#' + GEO_OPTIONS.LATITUDE, updateGeo);
            utils.bindAutoSaveEvent('#' + GEO_OPTIONS.LONGITUDE, updateGeo);
            utils.bindAutoSaveEvent('#' + GEO_OPTIONS.ALTITUDE, updateGeo);
            utils.bindAutoSaveEvent('#' + GEO_OPTIONS.ACCURACY, updateGeo);
            utils.bindAutoSaveEvent('#' + GEO_OPTIONS.ALTITUDE_ACCURACY, updateGeo);

            document.querySelector('#' + GEO_OPTIONS.DELAY).addEventListener('change', function () {
                updateGeo();
                delayLabel.textContent = delay.value;
            });

            document.querySelector('#' + GEO_OPTIONS.DELAY).addEventListener('input', function () {
                updateGeo();
                delayLabel.textContent = delay.value;
            });

            document.querySelector('#' + GEO_OPTIONS.TIMEOUT).addEventListener('click', function () {
                updateGeo();
            });

            var gpxFileLoader = document.querySelector('#' + GEO_OPTIONS.GPXFILE);
            var gpxFileButton = document.querySelector('#geo-gpxfile-button');
            gpxFileButton.addEventListener('click', function () {
                gpxFileLoader.input.click();
            });
            gpxFileLoader.addEventListener('change', function () {
                // It is possible to have no file selected and still get a change event.
                // You do this by selecting something, then selecting nothing.
                // You select nothing by cancelling out of the file picker dialog.
                var selectedFiles = this.files;
                if (selectedFiles.length > 0) {
                    loadGpxFile(selectedFiles[0]);
                    gpxFileButton.textContent = selectedFiles[0].name;
                } else {
                    gpxFileButton.textContent = 'Choose File';
                }
            });

            document.querySelector('#' + GEO_OPTIONS.GPXGO).addEventListener('click', function () {
                replayGpxTrack();
            });

            document.querySelector('#' + GEO_OPTIONS.HEADING).addEventListener('change', function () {
                updateGeo();
                updateHeadingValues();
            });

            document.querySelector('#' + GEO_OPTIONS.HEADING).addEventListener('input', function () {
                updateGeo();
                updateHeadingValues();
            });

            utils.bindAutoSaveEvent('#' + GEO_OPTIONS.SPEED, updateGeo);
            heading.value = positionInfo.heading;
            speed.value = positionInfo.speed;

            initMap();

            initializeValues();

            messages.on(positionUpdatedMessage, function () {
                _updateGpsMap();
            });

            updateGeo();

            function triggerPositionUpdatedMessage() {
                messages.emit(positionUpdatedMessage, {
                    latitude: latitude.value,
                    longitude: longitude.value,
                    altitude: altitude.value,
                    accuracy: accuracy.value,
                    altitudeAccuracy: altitudeAccuracy.value,
                    heading: heading ? heading.value : 0, // HACK: see techdebt http://www.pivotaltracker.com/story/show/5478847
                    speed: speed ? speed.value : 0, // HACK: see techdebt http://www.pivotaltracker.com/story/show/5478847

                    timeStamp: new Date()
                });
            }
        }
    };
};
