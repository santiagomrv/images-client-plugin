var imgvwr = {};

(function(lib) {

    var _viewer;
    var map_registry = {};
    var imageServiceBaseUrl = "http://dev.ala.org.au:8080/ala-images";

    var base_options = {
        imageServiceBaseUrl:  "http://dev.ala.org.au:8080/ala-images",
        auxDataUrl: '',
        auxDataTitle: 'View more information about this image',
        initialZoom: 'auto',
        addDownloadButton: true,
        addDrawer: true,
        addSubImageToggle: true,
        addCalibration: true,
        addImageInfo: true,
        addLoading: true,
        closeControlContent: null
    };


    lib.viewImage = function(targetDiv, imageId, options) {
        var mergedOptions = mergeOptions(options, targetDiv, imageId);
        initViewer(mergedOptions);
    };

    lib.resizeViewer = function(targetDiv) {
        var target = getTarget(targetDiv);
        map_registry[target].invalidateSize();
    };

    /**
     * Removes current image layer. Use case example: when reuisng viewer instance in a popup you don't want the previous
     * image to show up while the image you have requested is being loaded
     */
    lib.removeCurrentImage = function() {
        _viewer.eachLayer(function(layer) {
            _viewer.removeLayer(layer);
        });
    };

    /**
     * Provides the leaflet based viewer instance in case you need to perform some customizations
     * @returns leaflet map instance instance
     */
    lib.getViewerInstance = function() {
        return _viewer;
    };

    /** Allows the target div to be specified as a selector or jquery object */
    function getTarget(target) {
        return $(target).get(0);
    }

    function mergeOptions(userOptions, targetDiv, imageId) {
        var mergedOptions = {
            target:  targetDiv,
            imageId: imageId
        };

        $.extend(mergedOptions, base_options, userOptions);

        return mergedOptions;
    }

    function initViewer(opts) {

        imageServiceBaseUrl = opts.imageServiceBaseUrl;

        $.ajax( {
            dataType: 'jsonp',
            url: imageServiceBaseUrl + "/ws/getImageInfo/" + opts.imageId,
            crossDomain: true
        }).done(function(image) {
            if (image.success) {
                _createViewer(opts, image);
            }
        });
    }

    function _createViewer(opts, image) {

        var imageId = opts.imageId;
        imageServiceBaseUrl = opts.imageServiceBaseUrl;
        var maxZoom = image.tileZoomLevels ? image.tileZoomLevels - 1 : 0;

        var imageScaleFactor =  Math.pow(2, maxZoom);
        var imageHeight = image.height;

        var centerx = image.width / 2 / imageScaleFactor;
        var centery = image.height / 2 / imageScaleFactor;

        var p1 = L.latLng(image.height / imageScaleFactor, 0);
        var p2 = L.latLng(0, image.width / imageScaleFactor);
        var bounds = new L.latLngBounds(p1, p2);

        var measureControlOpts = false;

        var drawnItems = new L.FeatureGroup();

        var imageOverlays = new L.FeatureGroup();

        if(opts.addCalibration) {
            measureControlOpts = {
                mmPerPixel: image.mmPerPixel,
                imageScaleFactor: imageScaleFactor,
                imageWidth: image.width,
                imageHeight: image.height,
                hideCalibration: !opts.addCalibration,
                onCalibration: function (pixels) {
                    var opts = {
                        url: imageServiceBaseUrl + "/dialog/calibrateImageFragment/" + imageId + "?pixelLength=" + Math.round(pixels),
                        title: 'Calibrate image scale'
                    };
                    lib.showModal(opts);
                }
            };
        }

        var target = getTarget(opts.target);

        // Check if this element has already been initialized as a leaflet viewer
        if (map_registry[target]) {
            // if so, we need to un-initialize it
            map_registry[target].remove();
            delete map_registry[target];
        }

        var viewer = L.map(target, {
            fullscreenControl: true,
            measureControl: measureControlOpts,
            minZoom: 2,
            maxZoom: maxZoom,
            zoom: getInitialZoomLevel(opts.initialZoom, maxZoom, image, opts.target),
            center: new L.LatLng(centery, centerx),
            crs: L.CRS.Simple
        });

        _viewer = viewer;

        viewer.addLayer(drawnItems);

        map_registry[target] = viewer;

        var urlMask = image.tileUrlPattern;
        L.tileLayer(urlMask, {
            attribution: '',
            maxNativeZoom: maxZoom,
            continuousWorld: true,
            tms: true,
            noWrap: true,
            bounds: bounds
        }).addTo(viewer);

        if (opts.addImageInfo){
            var ImageInfoControl = L.Control.extend( {

                options: {
                    position: "bottomleft",
                    title: 'Image details'
                },
                onAdd: function (map) {
                    var container = L.DomUtil.create("div", "leaflet-bar");
                    var detailsUrl = imageServiceBaseUrl + "/image/details/" + opts.imageId;
                    $(container).html("<a href='" + detailsUrl + "' title='" + this.options.title + "'><span class='fa fa-external-link'></span></a>");
                    return container;
                }
            });
            viewer.addControl(new ImageInfoControl());
        }

        if (opts.auxDataUrl) {

            var AuxInfoControl = L.Control.extend({

                options: {
                    position: "topleft",
                    title: 'Auxiliary data'
                },
                onAdd: function (map) {
                    var container = L.DomUtil.create("div", "leaflet-bar");
                    $(container).html("<a id='btnImageAuxInfo' title='" + opts.auxDataTitle + "' href='#'><span class='fa fa-info'></span></a>");
                    $(container).find("#btnImageAuxInfo").click(function (e) {
                        e.preventDefault();
                        $.ajax( {
                            dataType: 'jsonp',
                            url: opts.auxDataUrl,
                            crossDomain: true
                        }).done(function(auxdata) {
                            var body = "";
                            if (auxdata.data) {
                                body = '<table class="table table-condensed table-striped table-bordered">';
                                for (var key in auxdata.data) {
                                    body += '<tr><td>' + key + '</td><td>' + auxdata.data[key] + '</td></tr>';
                                }
                                body += '</table>';
                            }

                            if (auxdata.link && auxdata.linkText) {
                                body += '<div><a href="' + auxdata.link + '">' + auxdata.linkText + '</a>';
                            } else if (auxdata.link) {
                                body += '<div><a href="' + auxdata.link + '">' + auxdata.link + '</a>';
                            }

                            lib.showModal({
                                title: auxdata.title ? auxdata.title : "Image " + opts.imageId,
                                content: body,
                                width: 800
                            });
                        });
                    });
                    return container;
                }
            });

            viewer.addControl(new AuxInfoControl());
        }

        if (opts.addDownloadButton) {

            var DownloadControl = L.Control.extend({

                options: {
                    position: "topleft",
                    title: 'Download button'
                },
                onAdd: function (map) {
                    var container = L.DomUtil.create("div", "leaflet-bar");
                    $(container).html("<a id='btnDownload' title='Download this image' href='#'><span class='fa fa-download'></span></a>");
                    $(container).find("#btnDownload").click(function (e) {
                        e.preventDefault();
                        window.location.href = opts.imageServiceBaseUrl + "/image/proxyImage/" + opts.imageId + "?contentDisposition=true";
                    });
                    return container;
                }
            });

            viewer.addControl(new DownloadControl());
        }

        if (opts.addDrawer){
            // Initialise the draw control and pass it the FeatureGroup of editable layers
            var drawControl = new L.Control.Draw({
                edit: {
                    featureGroup: drawnItems
                },
                draw: {
                    position: 'topleft',
                    circle: false,
                    rectangle: {
                        shapeOptions: {
                            weight: 1,
                            color: 'blue'
                        }
                    },
                    marker: false,
                    polyline: false,
                    polygon: false
                }

            });
            viewer.addControl(drawControl);

            $(".leaflet-draw-toolbar").last().append('<a id="btnCreateSubimage" class="viewer-custom-buttons leaflet-disabled fa fa-picture-o" href="#" title="Draw a rectangle to create a sub image"></a>');

            $("#btnCreateSubimage").click(function(e) {
                e.preventDefault();

                var layers = drawnItems.getLayers();
                if (layers.length <= 0) {
                    return;
                }

                var ll = layers[0].getLatLngs();

                // Need to calculate x,y,height and width, where x is the min longitude,
                // y = min latitude, height = max latitude - y and width = max longitude - x
                var minx = image.width, miny = image.height, maxx = 0, maxy = 0;

                for (var i = 0; i < ll.length; ++i) {
                    var y = Math.round(image.height - ll[i].lat * imageScaleFactor);
                    var x = Math.round(ll[i].lng * imageScaleFactor);

                    if (y < miny) {
                        miny = y;
                    }
                    if (y > maxy) {
                        maxy = y;
                    }
                    if (x < minx) {
                        minx = x;
                    }
                    if (x > maxx) {
                        maxx = x;
                    }
                }

                var height = maxy - miny;
                var width = maxx - minx;

                var url = imageServiceBaseUrl + "/image/createSubimageFragment/" + imageId + "?x=" + minx + "&y=" + miny + "&width=" + width + "&height=" + height;
                var opts = {
                    title: "Create subimage",
                    url: url,
                    onClose: function() {
                        drawnItems.clearLayers();
                    }
                };
                lib.showModal(opts);
            });

            viewer.on('draw:created', function (e) {
                //var type = e.layerType,
                var layer = e.layer;
                drawnItems.clearLayers();
                drawnItems.addLayer(layer);
                $("#btnCreateSubimage").removeClass("leaflet-disabled");
                $("#btnCreateSubimage").attr("title", "Create a subimage from the currently drawn rectangle");
            });

            viewer.on('draw:deleted', function (e) {
                var button = $("#btnCreateSubimage");
                button.addClass("leaflet-disabled");
                button.attr("title", "Draw a rectangle to create a subimage");

            });
        }

        if (opts.addSubImageToggle){

           viewer.addLayer(imageOverlays);

            var ViewSubImagesControl = L.Control.extend({

                options: {
                    position: "topright",
                    title: 'View subimages button'
                },
                onAdd: function (map) {
                    var container = L.DomUtil.create("div", "leaflet-bar");
                    $(container).html("<a id='btnViewSubimages' title='View subimages' href='#' style='width:110px;'>Show&nbsp;subimages</a>");
                    $(container).find("#btnViewSubimages").click(function (e) {
                        e.preventDefault();
                        var isShowing = hookShowSubimages();
                        if(isShowing){
                           $('#btnViewSubimages').html('Hide&nbsp;subimages');
                        } else {
                           $('#btnViewSubimages').html('Show&nbsp;subimages');
                        }
                    });
                    return container;
                }
            });

            function hookShowSubimages() {

                if (imageOverlays.getLayers().length == 0) {
                    $.ajax(imageServiceBaseUrl + "/ws/getSubimageRectangles/" + opts.imageId).done(function(results) {
                        if (results.success) {
                            for (var subimageIndex in results.subimages) {

                                var rect = results.subimages[subimageIndex];
                                var imageId = rect.imageId;
                                var lng1 = rect.x / imageScaleFactor;
                                var lat1 = (imageHeight - rect.y) / imageScaleFactor;
                                var lng2 = (rect.x + rect.width) / imageScaleFactor;
                                var lat2 = (imageHeight - (rect.y + rect.height)) / imageScaleFactor;
                                var bounds = [[lat1,lng1], [lat2, lng2]];

                                var feature = L.rectangle(bounds, { color: "#ff7800", weight: 1, imageId:imageId, className: imageId});
                                feature.addTo(imageOverlays);
                                feature.on("click", function(e) {
                                    var imageId = e.target.options.imageId;
                                    if (imageId) {
                                        window.location = imageServiceBaseUrl + "/image/details?imageId=" + imageId;
                                    }
                                });

                                feature.on('mouseover', function (e) {

                                    var popup = L.popup()
                                        .setLatLng(e.latlng) //(assuming e.latlng returns the coordinates of the event)
                                        .setContent('<p>Loading..' + e.target.options.imageId +'.</p>')
                                        .openOn(viewer);
                                    console.log('loading ' + e.target.options.imageId);

                                    $.ajax( imageServiceBaseUrl + "/image/imageTooltipFragment?imageId=" + e.target.options.imageId).then(function(content) {
                                        popup.setContent(content);
                                    },
                                    function(xhr, status, error) {
                                        console.log( status + ": " + error);
                                    });
                                });
                                feature.on('mouseout', function (e) {
                                    this.closePopup();
                                });
                            }

                            $(".subimage-path").each(function() {
                                var classNames = $(this).attr("class");
                                classNames = $.trim(classNames).split(" ");
                                // Work out the imageId
                                var imageId = "";
                                for (index in classNames) {
                                    var className = classNames[index];
                                    var matches = className.match(/imageId[-](.*)/);
                                    if (matches) {
                                        imageId = matches[1];
                                        break;
                                    }
                                }
                            });
                        }
                    });
                    return true;
                } else {
                    imageOverlays.clearLayers();
                    return false
                }
            }

            viewer.addControl(new ViewSubImagesControl());
        }

        if (opts.addLoading) {
            var loadingControl = L.Control.loading({
                separate: true
            });
            viewer.addControl(loadingControl);
        }

        if (opts.closeControlContent) {
            var ClosePopupControl = L.Control.extend({
                options: {
                    position: 'topright',
                    title: 'Close gallery',
                    content: opts.closeControlContent
                },

                onAdd: function (map) {
                    var options = this.options;
                    var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                    var link = L.DomUtil.create('a', 'leaflet-control-close-popup', container);
                    link.innerHTML = options.content;
                    link.href = '#';
                    container.title = options.title;

                    return container;
                }
            });

            viewer.addControl(new ClosePopupControl());

        }

    }

    /**
     * Returns the initial level of zoom for the image viewer. If initialZoom = 'auto' it will calculate the optimum zoom
     * level for the available space in the viewer container
     * @param initialZoom
     * @param maxZoom
     * @param image
     * @param container
     * @returns {*}
     */
    getInitialZoomLevel = function (initialZoom, maxZoom, image, container) {
        var zoomLevel = maxZoom;
        if (initialZoom == 'auto') {
            var containerWidth = $(container).width();
            var containerHeight = $(container).height();
            var imageWidth = image.width;
            var imageHeight = image.height;
            if (imageWidth > imageHeight) {
                // Landscape photo
                while (containerWidth < imageWidth && zoomLevel > 0) {
                    zoomLevel--;
                    imageWidth /= 2;
                }
            } else {
                // Portrait photo
                while (containerHeight < imageHeight && zoomLevel > 0) {
                    zoomLevel--;
                    imageHeight /= 2;
                }
            }
        } else if ($.isNumeric(initialZoom) && Math.abs(initialZoom) <= maxZoom) {
            zoomLevel = Math.abs(initialZoom);
        }

        return zoomLevel
    };

    lib.showModal = function(options) {

        var opts = {
            backdrop: options.backdrop ? options.backdrop : true,
            keyboard: options.keyboard ? options.keyboard: true,
            url: options.url ? options.url : false,
            id: options.id ? options.id : 'modal_element_id',
            height: options.height ? options.height : 500,
            width: options.width ? options.width : 600,
            title: options.title ? options.title : 'Modal Title',
            hideHeader: options.hideHeader ? options.hideHeader : false,
            onClose: options.onClose ? options.onClose : null,
            onShown: options.onShown ? options.onShown : null,
            content: options.content
        };

        var html = "<div id='" + opts.id + "' class='modal hide' role='dialog' aria-labelledby='modal_label_" + opts.id + "' aria-hidden='true' style='width: " + opts.width + "px; margin-left: -" + opts.width / 2 + "px;overflow: hidden'>";
        var initialContent = opts.content ? opts.content : "Loading...";
        if (!opts.hideHeader) {
            html += "<div class='modal-header'><button type='button' class='close' data-dismiss='modal' aria-hidden='true'>x</button><h3 id='modal_label_" + opts.id + "'>" + opts.title + "</h3></div>";
        }
        html += "<div class='modal-body' style='max-height: " + opts.height + "px'>" + initialContent + "</div></div>";

        $("body").append(html);

        var selector = "#" + opts.id;

        $(selector).on("hidden", function() {
            if (opts.onClose) {
                opts.onClose();
            }
            $(selector).remove();
        });

        $(selector).on("shown", function() {
            if (opts.onShown) {
                opts.onShown();
            }
        });

        $(selector).modal({
            remote: opts.url,
            keyboard: opts.keyboard,
            backdrop: opts.backdrop
        });
    };

    lib.hideModal = function() {
        $("#modal_element_id").modal('hide');
    };

    lib.areYouSureOptions = {};

    lib.areYouSure = function(options) {

        if (!options.title) {
            options.title = "Are you sure?"
        }

        if (!options.message) {
            options.message = options.title;
        }

        var modalOptions = {
            url: imageServiceBaseUrl + "/dialog/areYouSureFragment?message=" + encodeURIComponent(options.message),
            title: options.title
        };

        lib.areYouSureOptions.affirmativeAction = options.affirmativeAction;
        lib.areYouSureOptions.negativeAction = options.negativeAction;

        lib.showModal(modalOptions);
    };

    lib.onAlbumSelected = null;

    lib.selectAlbum = function(onSelectFunction) {
        var opts = {
            title: "Select an album",
            url: imageServiceBaseUrl + "/album/selectAlbumFragment"
        };
        lib.onAlbumSelected = function(albumId) {
            lib.hideModal();
            if (onSelectFunction) {
                onSelectFunction(albumId);
            }
        };
        lib.showModal(opts);
    };

    lib.onTagSelected = null;

    lib.onTagCreated = null;

    lib.selectTag = function(onSelectFunction) {
        var opts = {
            width: 700,
            title: "Select a tag",
            url: imageServiceBaseUrl + "/tag/selectTagFragment"
        };

        lib.onTagSelected = function(tagId) {
            lib.hideModal();
            if (onSelectFunction) {
                onSelectFunction(tagId);
            }
        };
        lib.showModal(opts);
    };

    lib.createNewTag = function(parentTagId, onCreatedFunction) {

        var opts = {
            title: "Create new tag from path",
            url: imageServiceBaseUrl + "/tag/createTagFragment?parentTagId=" + parentTagId
        };

        lib.onTagCreated = function(tagId) {
            lib.hideModal();
            if (onCreatedFunction) {
                onCreatedFunction(tagId);
            }
        };
        lib.showModal(opts);
    };

    lib.onAddMetadata = null;

    lib.promptForMetadata = function(onMetadata) {

        var opts = {
            title: "Add meta data item",
            url: imageServiceBaseUrl + "/dialog/addUserMetadataFragment"
        };

        lib.onAddMetadata = function(key, value) {
            lib.hideModal();
            if (onMetadata) {
                onMetadata(key, value);
            }
        };

        lib.showModal(opts);
    };

    lib.bindImageTagTooltips = function() {
        $(".image-tags-button").each(function() {
            var imageId = $(this).closest("[imageId]").attr("imageId");
            if (imageId) {
                $(this).qtip({
                    content: {
                        text: function(event, api) {
                            $.ajax(imageServiceBaseUrl + "/image/imageTagsTooltipFragment/" + imageId).then(function(content) {
                                    api.set("content.text", content);
                                },
                                function(xhr, status, error) {
                                    api.set("content.text", status + ": " + error);
                                });
                        }
                    }
                });
            }
        });
    };

    lib.htmlEscape = function(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    lib.htmlUnescape = function(value) {
        return String(value)
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    };

    lib.showSpinner = function(message) {
        var spinner = $(".spinner");
        if (message) {
            spinner.attr("title", message);
        } else {
            spinner.attr("title", "");
        }
        spinner.css("display", "block");
    };

    lib.hideSpinner = function() {
        var spinner = $(".spinner");
        spinner.css("display", "none");
    };

    lib.bindTooltips = function(selector, width) {

        if (!selector) {
            selector = "a.fieldHelp";
        }
        if (!width) {
            width = 300;
        }
        // Context sensitive help popups
        $(selector).each(function() {


            var tooltipPosition = $(this).attr("tooltipPosition");
            if (!tooltipPosition) {
                tooltipPosition = "bottomRight";
            }

            var targetPosition = $(this).attr("targetPosition");
            if (!targetPosition) {
                targetPosition = "topMiddle";
            }
            var tipPosition = $(this).attr("tipPosition");
            if (!tipPosition) {
                tipPosition = "bottomRight";
            }

            var elemWidth = $(this).attr("width");
            if (elemWidth) {
                width = elemWidth;
            }

            $(this).qtip({
                tip: true,
                position: {
                    corner: {
                        target: targetPosition,
                        tooltip: tooltipPosition
                    }
                },
                style: {
                    width: width,
                    padding: 8,
                    background: 'white', //'#f0f0f0',
                    color: 'black',
                    textAlign: 'left',
                    border: {
                        width: 4,
                        radius: 5,
                        color: '#E66542'// '#E66542' '#DD3102'
                    },
                    tip: tipPosition,
                    name: 'light' // Inherit the rest of the attributes from the preset light style
                }
            }).bind('click', function(e){ e.preventDefault(); return false; });

        });
    };
})(imgvwr);
