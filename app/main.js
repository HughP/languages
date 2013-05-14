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
		initMap();
	} else {
		dojo.connect(_map,"onLoad",function(){
			initMap();
		});
	}
}

function initMap() {
	
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
	
	// get the point data
	
	var serviceMain = new CSVService();
	$(serviceMain).bind("complete", function(){	
		_recsMain = parseRecs(serviceMain.getLines());
		loadUniqueLanguages();
		$("#selectLanguage").change(function(e) {
            symbolizeLanguage($(this).attr("value"));
        });
		symbolizeLanguage($("#selectLanguage option:first").attr("value"));
	});
	serviceMain.process(SPREADSHEET_MAIN_URL);
	
	var serviceOverview = new CSVService();
	$(serviceOverview).bind("complete", function(){	
		_recsOV = parseOVRecs(serviceOverview.getLines());
		console.log(_recsOV.length);
	});
	serviceOverview.process(SPREADSHEET_OVERVIEW_URL);
}

function loadUniqueLanguages() 
{
	var arr = [];
	$.each(_recsMain, function(index, value) {
		if (!($.inArray($.trim(value.getLanguage()), arr) > -1)) {
			arr.push($.trim(value.getLanguage()));
		}
	});
	arr.sort();
	var value;
	$.each(arr, function(index, name) {
		value = $.grep(_recsMain, function(n, i) {
			return n.getLanguage() == name;
		})[0].getLanguageID();
		$("#selectLanguage").append("<option value='"+value+"'>"+name+"</option>");
	});
}

function symbolizeLanguage(languageID)
{

	_map.graphics.clear();
	
	var pt;
	var graphic; 
	var sym =  new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SQUARE, 10,
			   new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
			   new dojo.Color([0,0,0]), 1),
			   new dojo.Color([255,0,0,0.25]));
			   
	var selected = $.grep(_recsMain, function(n, i){return n.getLanguageID() == languageID});
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
	
	_map.setLevel(3)
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

function parseRecs(lines) 
{
	
	var FIELDNAME_LONGITUDE = "Longitude";
	var FIELDNAME_LATITUDE = "Latitude";	
	var FIELDNAME_NAME = "Name";
	var FIELDNAME_LANGUAGE_ID = "Language_ID";
	var FIELDNAME_LANGUAGE = "Language";
	var FIELDNAME_REGION = "Region";
	var FIELDNAME_TEXT = "Text";
	var FIELDNAME_PHOTO = "Photo";
	var FIELDNAME_AUDIO = "Audio";
	var FIELDNAME_VIDEO = "Video";
	var FIELDNAME_LINK = "Link";
	var FIELDNAME_CREDIT_PHOTO = "Credit_Photo";
	var FIELDNAME_CREDIT_AUDIO = "Credit_Audio";
	var FIELDNAME_CREDIT_VIDEO = "Credit_Video";
	var FIELDNAME_MORE_INFO = "More_Info";
	var FIELDNAME_MORE_INFO_URL = "More_Info_URL";
	var FIELDNAME_NOTES = "Notes";
	
	var fields = lines[0];
	
	var values;
	var rec;
	var recs = [];		
	for (var i = 1; i < lines.length; i++) {
		
		values = lines[i];
		if (values.length == 1) {
			break;
		}

		rec = new RecordMain(
			values[getFieldIndex(FIELDNAME_NAME,fields)],
			parseInt(values[getFieldIndex(FIELDNAME_LANGUAGE_ID,fields)]),
			values[getFieldIndex(FIELDNAME_LANGUAGE,fields)],
			values[getFieldIndex(FIELDNAME_REGION,fields)],
			values[getFieldIndex(FIELDNAME_LONGITUDE,fields)],
			values[getFieldIndex(FIELDNAME_LATITUDE,fields)]							
		);

		recs.push(rec);

	}	
	
	return recs;
}

function parseOVRecs(lines)
{
	
	//Name	Language_ID	Language	Region	Longitude	Latitude	Text	Media	Link	Credit	Audio	Notes

	var fields = lines[0];
	
	var values;
	var rec;
	var recs = [];		
	for (var i = 1; i < lines.length; i++) {
		
		values = lines[i];
		if (values.length == 1) {
			break;
		}

		rec = new RecordOV();

		recs.push(rec);

	}	
	
	return recs;
	
}

function getFieldIndex(name,fields) 
{
	var idx = -1;
	$.each(fields,function(index,value){
		if (value.toUpperCase() == name.toUpperCase()) {
			idx = index;
			return false;
		}
	});
	return idx;
}