dojo.require("dijit.layout.BorderContainer");
dojo.require("dijit.layout.ContentPane");
dojo.require("esri.arcgis.utils");
dojo.require("esri.map");

/******************************************************
***************** begin config section ****************
*******************************************************/

var TITLE = "Endangered Languages"
var BYLINE = "Just a test to make sure there are no issues reading the data.";
var BASEMAP_SERVICE_NATGEO = "http://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer";
var SPREADSHEET_MAIN_URL = "/proxy/proxy.ashx?https://docs.google.com/spreadsheet/pub?key=0ApQt3h4b9AptdDR2cjc2Wm4xcFpSQjVlT2ZnX3BEemc&output=csv";
var SPREADSHEET_OVERVIEW_URL = "/proxy/proxy.ashx?https://docs.google.com/spreadsheet/pub?key=0ApQt3h4b9AptdDByc0FOY2NacHZNUlhjWnZ6WHdYb1E&output=csv";

/******************************************************
***************** end config section ******************
*******************************************************/

var _map;
var _recsMain;
var _recsOV;
var _lods;

var _dojoReady = false;
var _jqueryReady = false;

var _homeExtent; // set this in init() if desired; otherwise, it will 
				 // be the default extent of the web map;

var _isMobile = isMobile();

var _isEmbed = false;

dojo.addOnLoad(function() {_dojoReady = true;init()});
jQuery(document).ready(function() {_jqueryReady = true;init()});

function init() {
	
	if (!_jqueryReady) return;
	if (!_dojoReady) return;
	
	// determine whether we're in embed mode
	
	var queryString = esri.urlToObject(document.location.href).query;
	if (queryString) {
		if (queryString.embed) {
			if (queryString.embed.toUpperCase() == "TRUE") {
				_isEmbed = true;
			}
		}
	}
	
	// jQuery event assignment
	
	$(this).resize(handleWindowResize);
	
	$("#zoomIn").click(function(e) {
        _map.setLevel(_map.getLevel()+1);
    });
	$("#zoomOut").click(function(e) {
        _map.setLevel(_map.getLevel()-1);
    });
	$("#zoomExtent").click(function(e) {
        _map.setExtent(_homeExtent);
    });
	
	$("#title").append(TITLE);
	$("#subtitle").append(BYLINE);	

	_map = new esri.Map("map", {slider:false});
	_map.addLayer(new esri.layers.ArcGISTiledMapServiceLayer(BASEMAP_SERVICE_NATGEO));

	if(_map.loaded){
		init2();
	} else {
		dojo.connect(_map,"onLoad",function(){
			init2();
		});
	}
}

function init2() {
	
	// if _homeExtent hasn't been set, then default to the initial extent
	// of the web map.  On the other hand, if it HAS been set AND we're using
	// the embed option, we need to reset the extent (because the map dimensions
	// have been changed on the fly).

	if (!_homeExtent) {
		_homeExtent = _map.extent;
	} else {
		if (_isEmbed) {
			setTimeout(function(){
				_map.setExtent(_homeExtent)
			},500);
		}	
	}
	
	_lods = _map._params.lods.reverse();
	
	handleWindowResize();
	
	// get the spreadsheet data
	
	var serviceMain = new CSVService();
	$(serviceMain).bind("complete", function(){	
		var parser = new ParserMain(serviceMain.getLines());
		_recsMain = parser.getRecs();
		init3();
	});
	serviceMain.process(SPREADSHEET_MAIN_URL);
	
	var serviceOverview = new CSVService();
	$(serviceOverview).bind("complete", function() {
		var parser = new ParserOV(serviceOverview.getLines());	
		_recsOV = parser.getRecs()
		init3();
	});
	serviceOverview.process(SPREADSHEET_OVERVIEW_URL);
	
}

function init3() 
{
	if ((_recsMain == null) || (_recsOV == null)) {
		return;
	}
	
	loadUniqueLanguages();
	$("#selectLanguage").change(function(e) {
		symbolizeLanguage($(this).attr("value"));
	});
	symbolizeLanguage($("#selectLanguage option:first").attr("value"));
	
}

// -----------------
// private functions
// -----------------

function loadUniqueLanguages() 
{
	var arr1 = [];
	$.each(_recsMain, function(index, value) {
		if (!($.inArray(value.getLanguageID(), arr1) > -1)) {
			arr1.push(value.getLanguageID());
		}
	});
	
	var language;
	var arr2 = [];
	$.each(arr1, function(index, id) {
		language = $.grep(_recsOV, function(n, i) {
			return n.getLanguageID() == id;
		})[0].getLanguage();
		arr2.push({languageID: id, language: language});
	});
	
	arr2.sort(function(a,b) {return a.language.replace(/[^a-z]/ig,'') > b.language.replace(/[^a-z]/ig,'') ? 1 : -1;});

	$.each(arr2, function(index, value) {
		$("#selectLanguage").append("<option value='"+value.languageID+"'>"+value.language+"</option>");
	});
	
}

function symbolizeLanguage(languageID)
{

	_map.graphics.clear();
	_map.setLevel(3)
	
	var pt;
	var graphic; 
	var sym =  new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE, 10,
			   new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
			   new dojo.Color([0,0,0]), 1),
			   new dojo.Color([255,0,0,0.25]));
			   
	var selected = $.grep(_recsMain, function(n, i){return n.getLanguageID() == languageID});
	if (selected.length == 0) {
		alert("no records for the selected language in the main table");
		return false;
	}
	
	var multi = new esri.geometry.Multipoint(new esri.SpatialReference({wkid:102100}));
	
	$.each(selected, function(index, value) {
		pt = esri.geometry.geographicToWebMercator(
			new esri.geometry.Point(
				[value.getLongitude(), value.getLatitude()],
				new esri.SpatialReference({ wkid:4326}))
		);
		
		graphic = new esri.Graphic(pt, sym, value);		
		_map.graphics.add(graphic);
		multi.addPoint(pt);
	});
	
	setTimeout(function(){
		_map.centerAt(multi.getExtent().getCenter());
		setTimeout(function(){
			var extent;
			$.each(_lods, function(index, value) {
				extent = new esri.geometry.getExtentForScale(_map, value.scale);
				if (extent.contains(multi.getExtent())) {
					_map.centerAndZoom(multi.getExtent().getCenter(), value.level);
					return false;
				}
			});
		},1000);
	},1000);
		
}

function handleWindowResize() {
	if ((($("body").height() <= 500) || ($("body").width() <= 800)) || _isEmbed) $("#header").height(0);
	else $("#header").height(115);
	
	$("#map").height($("body").height() - $("#header").height());
	$("#map").width($("body").width());
	_map.resize();
}
