/* jshint -W100 */
var SERVER = "/idrivesafe";
var SID = null;
var LANG = "en";
var PLOT = null;
var MAP = null;
var MARKERS = [];
var MULTIPOLY = [];
var TRANSLATIONS;

// Localization
var MEASURE = null;
var KM2MI = 0.6214;
var FIRST_DAY = 1;

var SETTINGS = [
	{"n":"Default","p":[{"a":2.7,"b":3.2,"t":2.2},{"a":2.5,"b":3,"t":2.1},{"a":2.3,"b":2.8,"t":2}]}
];

var DATE_FORMAT = "";
var TZ = 0, DST = 0, TIMEZONE_DIFF = 0;
var TODAY = {from: 0, to: 0};

var LOCAL_STATE = {
	dragging: false,
	///
	tab_index: 0,
	/// Cache for items by type
	item_cache: {},
	///
	last_sel_tab: "",
	///
	tab_history: [],
	///
	last_flot_hover: null,
	///
	last_flot_click: null,
	///
	map_bounds: [],
	///
	criteria: [
		{"yaxis":{"from":0,"to":1},"color":"#fce6e8"},
		{"yaxis":{"from":1,"to":4},"color":"#fdf2de"},
		{"yaxis":{"from":4,"to":5},"color":"#e6f6f6"}
	],
	///
	colors: {"0":"",1:"#59c2bd",2:"#fcc32b",4:"#c47db7",8:"#369dca"},
	///
	color_in_use: 0,
	///
	unit_opts: {},
	///
	tabs:{},
	///
	speed_color:["#66ffff", "#0099ff", "#3300ff", "#990099", "#ff0033"],
	///
	speed_limit: [0, 40, 60, 90, 120],
	speed_limit_us: [0, 25, 40, 55, 75]
};

/// Global event handlers
var callbacks = {};

/** Execute callback
 *
 *  @param {int} id   callback id
 */
function exec_callback(id) {
	if (!callbacks[id])
		return null;
	callbacks[id].call();
	delete callbacks[id];
	return null;
}

/** Wrap callback function
 *
 * @param {Function} callback   function to be saved and callback later
 * @returns {int} wrapped callback id
 */
function wrap_callback(callback) {
	var id = (new Date()).getTime();
	callbacks[id] = callback;
	return id;
}

/** Load scripts
 *
 * @param {String} src   script source
 * @param {Function} callback   function to be executed after script loaded
 */
function load_script(src, callback) {
	var script = document.createElement("script");
	script.setAttribute("type", "text/javascript");
	script.setAttribute("charset", "UTF-8");
	script.setAttribute("src", src);
	if (callback && typeof callback === "function") {
		wrap_callback(callback);
		if ($.browser.msie && parseInt($.browser.version,10)<9) {
			script.onreadystatechange = function () {
				if (this.readyState === 'complete') {
					callback();
				}
			};
		} else {
			script.setAttribute("onLoad", "exec_callback(" + wrap_callback(callback) + ")");
		}
	}
	document.getElementsByTagName("head")[0].appendChild(script);
}

/** Fetch variable from 'GET' request
 *
 *  @param {String} name   param name
 *  @returns {String} param value
 */
var get_url_parameter = _.memoize(function (name, def) {
	if (!name) {
		return null;
	}
	var pairs = document.location.search.substr(1).split("&");
	for (var i = 0; i < pairs.length; i++) {
		var pair = pairs[i].split("=");
		if (decodeURIComponent(pair[0]) === name) {
			return decodeURIComponent(pair[1]);
		}
	}
	return def || null;
});

/** Init Wialon SDK (callback of load script wialon.js)
 */
function init_sdk() {
	var url = get_url_parameter("baseUrl","https://hst-api.wialon.com");
	if (!url)
		url = get_url_parameter("hostUrl","https://hosting.wialon.com");
	if (!url)
		return;

	var user = get_url_parameter("user") || "";
	var sid = get_url_parameter("sid");
	var authHash = get_url_parameter("authHash");

	wialon.core.Session.getInstance().initSession(url, "gapp_idrive_safe");
	if (authHash) {
		wialon.core.Session.getInstance().loginAuthHash(authHash, login);
	} else if (sid) {
		wialon.core.Session.getInstance().duplicate(sid, user, true, login);
	}
}

/** Login callback
 */
function login(code) {
	if (code !== 0) {
		alert($.localise.tr("Login error"));
		return;
	}

	if (LANG != "en") {
		// Get translate-strings from datepicker
		var locale = $.datepicker.regional[LANG];
		wialon.util.DateTime.setLocale(
			locale.dayNames,
			locale.monthNames,
			locale.dayNamesShort,
			locale.monthNamesShort
		);
	}

	wialon.core.Remote.getInstance().startBatch("initBatch");
	var user = wialon.core.Session.getInstance().getCurrUser();
	user.getLocale(function(code, locale){
		if (code) {
			return;
		}

		var options = {
			template:
			'<div class="interval-wialon-container {className}" id="{id}">' +
			'   <div class="iw-select">' +
			'       <button data-period="0" type="button" class="iw-period-btn period_0">{yesterday}</button>' +
			'       <button data-period="1" type="button" class="iw-period-btn period_1">{today}</button>' +
			'       <button data-period="2" type="button" class="iw-period-btn period_2">{week}</button>' +
			'       <button data-period="3" type="button" class="iw-period-btn period_3">{month}</button>' +
			'       <button data-period="4" type="button" class="iw-period-btn period_4">{custom}</button>' +
			'   </div>' +
			'   <div class="iw-pickers">' +
			'       <input type="text" class="iw-from" /> &ndash; <input type="text" class="iw-to" />' +
			'       <button type="button" class="iw-time-btn">{ok}</button>' +
			'   </div>' +
			'   <div class="iw-labels">' +
			'       <a href="#" class="iw-similar-btn past" data-similar="past"></a>' +
			'       <a href="#" class="iw-similar-btn future" data-similar="future"></a>' +
			'       <span class="iw-label"></span>' +
			'   </div>' +
			'</div>',
			labels: {
				yesterday: $.localise.tr("Yesterday"),
				today: $.localise.tr("Today"),
				week: $.localise.tr("Week"),
				month: $.localise.tr("Month"),
				custom: $.localise.tr("Custom"),
				ok: "OK"
			},
			tzOffset: wialon.util.DateTime.getTimezoneOffset() + wialon.util.DateTime.getDSTOffset(),
			now: wialon.core.Session.getInstance().getServerTime(),
			onChange: changeTime,
			onInit: function(){
				$("#dateinterval").intervalWialon('set', 0);
			},
			onAfterClick: function () {
				$(".date-time-content").resize();
			}
		};

		if (locale && locale.fd) {
			var format = locale.fd.split("_");
			if (format.length == 2) {
				options.dateFormat = wialon.util.DateTime.convertFormat(format[0], true);
				DATE_FORMAT = wialon.util.DateTime.convertFormat(locale.fd, true);
				FIRST_DAY = locale.wd;
				options.firstDay = locale.wd;
			}
		} else {
			options.dateFormat = "dd/MMMM/yyyy";
			options.firstDay = 1;
			DATE_FORMAT = "dd/MMMM/yyyy_HH:mm:ss";
		}

		$("#dateinterval").intervalWialon(options);
	});

	MEASURE = user.getMeasureUnits();
	if (MEASURE == 1 || MEASURE == 2) {
		$("#sort_3").html($.localise.tr("Mileage") + ", " + $.localise.tr("mi"));
		$("#trip-length-limit").slider("value", $("#trip-length-limit").slider("value"));
		LOCAL_STATE.speed_limit = LOCAL_STATE.speed_limit_us;
	}

	var html = "";
	for (var j=0; j<LOCAL_STATE.speed_color.length; j++) {
		html += "<div class='speed-block'>";
		html += "<span>" + LOCAL_STATE.speed_limit[j] + "</span>";
		html += "<div class='speed-color' style='background:" + LOCAL_STATE.speed_color[j] + "'></div></div>";
	}
	$("#legend").html( html );

	SID = wialon.core.Session.getInstance().getId();
	var server_time = wialon.core.Session.getInstance().getServerTime();
	TZ = wialon.util.DateTime.getTimezoneOffset();
	DST = wialon.util.DateTime.getDSTOffset(server_time);
	var tt = new Date(get_user_time(server_time, TZ, DST)*1000);
	tt.setHours(0);
	tt.setMinutes(0);
	tt.setSeconds(0);
	tt.setMilliseconds(0);
	var tnow = new Date(tt);
	tnow.setSeconds(tnow.getSeconds() + 86399);

	TIMEZONE_DIFF = -1 * get_local_timezone() + TZ + DST;

	TODAY.from = tt.getTime()/1000 | 0;
	TODAY.to = tnow.getTime()/1000 | 0;

	$("#dateinterval").intervalWialon("set", 0);
	wialon.core.Session.getInstance().loadLibrary("itemIcon");
	changeType("avl_unit");
	wialon.core.Remote.getInstance().finishBatch(null, "initBatch");
}

/** Change type of object dealing with (search, analytics etc.)
 *  For now the only type is 'avl_unit'
 *
 *  @param {String} type   type of objects ('avl_units')
 */
function changeType(type) {
	var flags = wialon.item.Item.dataFlag.base |
				wialon.item.Item.dataFlag.image |
				wialon.item.Item.dataFlag.customProps;
	searchItems(
		qx.lang.Function.bind(function (items) {
			$("#items").html(fillListWithItems(items));
			addTab("tab_"+LOCAL_STATE.tab_index++);

			var ids = $.cookie("idrive");
			if (typeof ids === "undefined"){
				// first start: nothing to restore
			} else {
				ids = ids ? ids.split(",") : [];
				for (var i=0; i<ids.length; i++)
					if (findUnit(ids[i])){
						execute(ids[i]);
						$("#item_"+ids[i]).hide();
					}
			}
		}, this),
		flags
	);
}

/** Search items function
 *
 *  @param {Function} callback   function to be executed after all operations
 *  @param {int} flags   wialon flags
 *  @param {bool} force   is force update needed (if false - get units from cache)
 *  @param {String} type   type of objects ('avl_units')
 */
function searchItems(callback, flags, force, type){
	flags = flags || wialon.item.Item.dataFlag.base;
	force = force || true;
	type = type || "avl_unit";

	if (!force && LOCAL_STATE.item_cache[type]){
		callback(LOCAL_STATE.item_cache[type]);
	} else {
		var spec = {itemsType: type,propName: "sys_name",propValueMask: "*",sortType: "sys_name"};
		wialon.core.Session.getInstance().searchItems(spec, true, flags, 0, 0,
			qx.lang.Function.bind(function (cb, code, data) {
				if (code === 0 && data) {
					LOCAL_STATE.item_cache[type] = data["items"];
					cb(LOCAL_STATE.item_cache[type]);
				} else {
					alert($.localise.tr("No data for selected interval"));
				}
			}, this, callback));
	}
}

/** Construct html list of found units
 *
 *  @param {Array} items   found in searchItems items
 *  @returns {String} html list of items
 */
function fillListWithItems(items){
	var html = [], prop = null, cache = [];
	var template = _.template($("#item-template").html());
	wialon.core.Remote.getInstance().startBatch("UpdateCustomPropeties");
	for (var i=0,len=items.length; i<len; i++) {
		var unit = items[i];
		if (!unit) continue;

		var id = unit.getId();

		var tmp = template({
			"img": "",
			"key": id,
			"value": unit.getName()
		});
		html.push(tmp);
		cache.push([id,unit.getIconUrl(16)]);
		prop = unit.getCustomProperty("idrive");
		if (!prop) {
			LOCAL_STATE.unit_opts[id] = [1,1];
			unit.updateCustomProperty("idrive", "1;1");
		} else {
			prop = prop.split(";");
			if (prop && prop.length==2) {
				LOCAL_STATE.unit_opts[id] = [parseInt(prop[0],10),parseInt(prop[1],10)];
			} else {
				LOCAL_STATE.unit_opts[id] = [1,1];
			}
		}
	}
	wialon.core.Remote.getInstance().finishBatch(null, "UpdateCustomPropeties");

	var ID = setInterval(function(){
		if(cache.length){
			var j = 0, tmp = [];
			while(cache.length && (j++)<10){
				tmp=cache.shift();
				$("#item_"+tmp[0]+" .item-img img").attr("src", tmp[1]);
			}
		}else {
			clearInterval(ID);
		}
	},150);

	return html.join("");
}

/** Onload translation
 *  Translate text on page
 */
function ltranslate () {
	var title = decodeURIComponent(APP_CONFIG.alias || "iDriveSafe");
	$("#header .app-name").html(title);
	document.title = title;

	$("#sort_1").html($.localise.tr("Unit"));
	$("#sort_2").html($.localise.tr("Rate"));
	$("#sort_3").html($.localise.tr("Mileage") + ", " + $.localise.tr("km"));
	$("#sort_4").html($.localise.tr("Settings"));
	$("#sort_5").html($.localise.tr("Duration"));

	$("#add-unit-btn").html("<img src='img/add.png' alt=''/>"+$.localise.tr("Add unit"));

	$("#tabs .add-tab").attr("title", $.localise.tr("New tab"));

	$("#show-all").attr("title", $.localise.tr("Show on map"));

	$("#rigor_0").attr("title", $.localise.tr("Loyal assessment"));
	$("#rigor_1").attr("title", $.localise.tr("Normal assessment"));
	$("#rigor_2").attr("title", $.localise.tr("Strict assessment"));

	$("#no-data").html($.localise.tr("No data for selected interval"));

	// generate unit type select
	var i = 0,
		html = "",
		types = $.localise.tr('type');
	for (var t in types) {
		html += "<option value='" + (i++) + "'>" + (types[t] || t) + "</option>";
	}
	$("#unit-type").html(html);

	if (documentationLink) {
		$("#header .help").attr("href", documentationLink);
		$("#header .help").css("display","");
	}
}

/** Main initialization and handlers binding
 */
$(document).ready(function () {
	var url = get_url_parameter("baseUrl","https://hst-api.wialon.com");
	if (!url)
		url = get_url_parameter("hostUrl","https://hosting.wialon.com");
	if (!url)
		return;

	LANG = get_url_parameter("lang", "en");
	if (availableLanguages && ($.inArray(LANG, availableLanguages) == -1))
		LANG = "en";
	$.localise("lang/", {language: LANG});

	if (LANG != "en") {
		// load datepicker regional settings
		load_script('//apps.wialon.com/plugins/wialon/i18n/' + LANG + '.js', function() {
			$.datepicker.setDefaults($.datepicker.regional[LANG]);
		});
	}

	$.ajax({
		"url": "/idrivesafe/settings?lang=" + LANG,
		"dataType": "json"
	}).done(function(data){
		if (data) {
			SETTINGS = data;
		}
	}).fail(function(){
		alert($.localise.tr("Error getting settings from server"));
	});

	url += "/wsdk/script/wialon.js";
	load_script(url, init_sdk);

	var w = $.cookie("idrive-width");
	if (w) resizePanel($("#items"), $("#drag"), $("#statistic"), $(window).width(), {pageX:parseInt(w,10)});

	/// generate ticks for plot
	var j=0, ticks = [];
	ticks.push( LOCAL_STATE.criteria[j].yaxis.from );
	for (; j<LOCAL_STATE.criteria.length; j++){
		ticks.push( LOCAL_STATE.criteria[j].yaxis.to );
	}

	ltranslate();
	DATE_FORMAT = rightFormat($.datepicker._defaults.dateFormat, "HH:mm:ss");

	/// BINDS
	$("#trip-length-limit").slider({
		"range": "min",
		"min": 0,
		"max": 10,
		"step": 1,
		"change":function(event, ui){
			var label = "";
			if (MEASURE == 1 || MEASURE == 2) {
				label = ui.value=="0" ? "" : (ui.value * KM2MI).toFixed(1) + " " + $.localise.tr("mi");
			} else {
				label = ui.value=="0" ? "" : ui.value + " " + $.localise.tr("km");
			}
			$(this).children(".ui-slider-label").css("left", 10*ui.value+"%").html(label);
			$.cookie("triplimit", ui.value, {expires: 300});
		},
		"slide":function(event, ui){
			var label = "";
			if (MEASURE == 1 || MEASURE == 2) {
				label = ui.value=="0" ? "" : (ui.value * KM2MI).toFixed(1) + " " + $.localise.tr("mi");
			} else {
				label = ui.value=="0" ? "" : ui.value + " " + $.localise.tr("km");
			}
			$(this).children(".ui-slider-label").css("left", 10*ui.value+"%").html(label);
			var tab = null;
			for (var tab_id in LOCAL_STATE.tabs) {
				tab = LOCAL_STATE.tabs[tab_id];
				if (tab.tab_type) { // unit tab
					filterTrips(tab.stat[tab.units.id], ui.value);
					if (LOCAL_STATE.last_sel_tab == tab_id) {
						populateStat(LOCAL_STATE.last_sel_tab, null, ui.value);
					}
				} else { // stat tab
					for (j=0; j<tab.units.length; j++){
						filterTrips(tab.stat[tab.units[j].id], ui.value);
						if (LOCAL_STATE.last_sel_tab == tab_id) {
							populateStat(LOCAL_STATE.last_sel_tab, tab.units[j].id, ui.value);
						}
					}
				}
			}
		}
	});
	$("#trip-length-limit").slider("value", ($.cookie("triplimit") || 2));
	$("#trip-length-limit .ui-slider-handle").removeAttr("href").prop("title",$.localise.tr("Minimal trip length"));

	$("#items").on("click", ".arrow", function(){
		var id = $(this).parent().attr("id").split("_")[1];
		if( findUnitOnTab(LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab], id) )
			return;
		if (LOCAL_STATE.last_sel_tab=="tab_0")
			toggleCookie(id);
		execute(id);
		$(this).parent().hide();
	});

	$("#items").on("dblclick", ".item", function(){
		var id = $(this).attr("id").split("_")[1];
		if( findUnitOnTab(LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab], id) )
			return;
		if (LOCAL_STATE.last_sel_tab=="tab_0")
			toggleCookie(id);
		execute(id);
		$(this).hide();
	});

	$("#drag").mousedown(function(e){
		e.preventDefault();
		LOCAL_STATE.dragging = true;
		var left = $("#items");
		var center = $("#drag");
		var right = $("#statistic");
		var width = $(window).width();
		$(document).mousemove(qx.lang.Function.bind(resizePanel, this, left, center, right, width));
	});

	$(document).mouseup(function(e){
		if (LOCAL_STATE.dragging){
			LOCAL_STATE.dragging = false;
			$(document).unbind('mousemove');
			var t = resizePanel($("#items"), $("#drag"), $("#statistic"), $(window).width(), e);
			$.cookie("idrive-width", t, {expires: 300});
		}
	});

	$("#add-unit-btn").on("click", function() {
		if(LOCAL_STATE.item_cache.avl_unit.length) {
			$("#item_"+LOCAL_STATE.item_cache.avl_unit[0].getId()+" .arrow").trigger("dblclick");
		}
	});

	$("#all-stat").on("click", ".item_tr", function(evt){
		var id = $(this).attr("id").split("_")[1];
		if($(evt.target).hasClass("update")){
			$(this).children(".rate, .mileage, .duration").html("<img src='./img/loader.gif'/>");
			$(this).children(".duration").attr("title","").removeClass("update");
			execute(id, true);
		} else {
			var new_tab = "tab_"+LOCAL_STATE.last_sel_tab.split("_")[1]+"_"+id+"_"+LOCAL_STATE.tab_index++;
			addTab(new_tab);
			LOCAL_STATE.last_sel_tab = new_tab;
		}
	});

	$("#all-stat").on("click", ".delete-stat", function(){
		var tab = LOCAL_STATE.last_sel_tab;
		var id = $(this).parent().attr("id").split("_")[1];
		for (var i=0; i<LOCAL_STATE.tabs[tab].units.length; i++) {
			if(LOCAL_STATE.tabs[tab].units[i].id == id){
				abortRequest(LOCAL_STATE.tabs[tab].units[i]);
				LOCAL_STATE.tabs[tab].units[i] = null;
				LOCAL_STATE.tabs[tab].units.splice(i,1);
				break;
			}
		}
		if(LOCAL_STATE.tabs[tab].stat[id]) {
			LOCAL_STATE.tabs[tab].stat[id] = null;
			delete LOCAL_STATE.tabs[tab].stat[id];
		}

		$(this).parent().remove();
		$("#item_"+id).show();

		if (tab=="tab_0")
			toggleCookie(id, true);

		if (!LOCAL_STATE.tabs[tab].units.length)
			$("#add-unit-btn").show();

		return false;
	});

	$("#all-stat").on("click", ".sort-table", function(){
		if(!LOCAL_STATE.last_sel_tab) return false;
		var tab = LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab];
		if (!tab.tab_type) {
			$("#all-stat .sort:visible").css("display","none");
			var sort = this.id.split("_")[1] | 0;
			if (Math.abs(tab.sort)==sort)
				tab.sort *= -1;
			else
				tab.sort = sort;
			$(this).next("img").css("display","inline-block").attr("src","img/"+(tab.sort>0?"az.png":"za.png"));
			sortUnits(tab);
			showMenu(LOCAL_STATE.last_sel_tab, true);
		}
		return false;
	});

	$("#all-stat").on("click", ".settings", function(){
		var id = $(this).parent().attr("id").split("_")[1];
		toggleSettingsDialog(this, id);
		return false;
	});

	$("#item-info-block").on("click", ".settings", function(){
		var tab_info = LOCAL_STATE.last_sel_tab.split("_");
		var id = tab_info[1];
		if (tab_info.length==4)
			id = tab_info[2];
		toggleSettingsDialog(this, id);
		return false;
	});

	$("#unit-type").on("change", function(){
		var id = $("#settings").data("unit");
		LOCAL_STATE.unit_opts[id][0] = parseInt(this.value, 10);

		if(LOCAL_STATE.last_sel_tab.split("_").length==4)
			$("#item-info-block .settings img").prop("src","img/unit_"+this.value+".png");
		else
			$("#row_"+id+" .settings img").prop("src","img/unit_"+this.value+".png");

		var tab_info = [];
		for (var i in LOCAL_STATE.tabs) {
			tab_info = i.split("_");
			if (tab_info.length == 4) { // unit tab
				if (tab_info[2] == id){
					PLOT.unhighlight();
					calculateStat(id, LOCAL_STATE.tabs[i].stat[id]);
				}
			} else if(tab_info.length == 2){ // stat tab
				for (var j=0; j<LOCAL_STATE.tabs[i].units.length; j++)
					if (LOCAL_STATE.tabs[i].units[j].id==id){
						calculateStat(id, LOCAL_STATE.tabs[i].stat[id]);
						break;
					}
			}
		}
		populateStat(LOCAL_STATE.last_sel_tab, id, null, true);
	});

	$("#rigor td").on("click", function(){
		var id = $("#settings").data("unit");
		var rig = $("#rigor td.selected");

		if (LOCAL_STATE.unit_opts[id][1] == parseInt($(this).attr("id").split("_")[1], 10))
			return;

		rig.css("background-image","url('img/"+rig.attr("id")+".png')").removeClass("selected");
		$(this).css("background-image","url('img/"+this.id+"_a.png')").addClass("selected");

		LOCAL_STATE.unit_opts[id][1] = parseInt($(this).attr("id").split("_")[1], 10);

		var tab_info = [];
		for (var i in LOCAL_STATE.tabs) {
			tab_info = i.split("_");
			if (tab_info.length == 4) { // unit tab
				if (tab_info[2] == id){
					calculateStat(id, LOCAL_STATE.tabs[i].stat[id]);
				}
			} else if(tab_info.length == 2){ // stat tab
				for (var j=0; j<LOCAL_STATE.tabs[i].units.length; j++)
					if (LOCAL_STATE.tabs[i].units[j].id==id){
						calculateStat(id, LOCAL_STATE.tabs[i].stat[id]);
						break;
					}
			}
		}

		populateStat(LOCAL_STATE.last_sel_tab, id, null, true);
	});

	$("body").click(function(evt){
		if( !$(evt.target).hasClass("settings") && $(evt.target).attr("id")!="unit-type" && $(evt.target).parent().attr("id")!="unit-type" )
			toggleSettingsDialog();
	});

	$("#viol-table").on("click", ".viol-tr", function(){
		if(!MAP) return;
		var t = $("#viol-table tr.selected");
		if (t.size()) {
			t.removeClass("selected");
			MARKERS[t.data("index")].closePopup();
			$(MARKERS[t.data("index")]._icon).children(".number").removeClass("selected");
		}

		$(this).addClass("selected");

		$(MARKERS[$(this).data("index")]._icon).children(".number").addClass("selected");
		MAP.panTo([$(this).data("y"), $(this).data("x")]);
	});

	$("#show-all").on("click", function(){
		if(!MAP) return;
		if (MAP && LOCAL_STATE.map_bounds.length)
			MAP.fitBounds(LOCAL_STATE.map_bounds, {padding:[10,10]});
	});

	$("#tabs").on("click", ".tab", function(){
		switchTab(this.id);
	});

	$("#tabs").on("click", ".add-tab", function(){
		if($("#tabs .limited-tab").size() < 4){
			addTab("tab_"+LOCAL_STATE.tab_index++);
		}
		if($("#tabs .limited-tab").size() >= 4){
			$("#tabs .add-tab").hide();
		}
	});

	$("#tabs").on("click", ".closetab", function(){
		closeTab($(this).prev().attr("id"));
		if($("#tabs .limited-tab").size() < 4){
			$("#tabs .add-tab").show();
		}
	});

	$("#footer .scroll").on("resize", function(){
		if($(this).innerWidth() < this.scrollWidth && $("#footer .arrow").css("display")=="none"){
			$("#footer .arrow").show();
		} else if ($(this).innerWidth() == this.scrollWidth && $("#footer .arrow").css("display")=="block") {
			$("#footer .arrow").hide();
		}
	});

	$("#footer .scroll").on("mousewheel", function(event, delta){
		this.scrollLeft -= (delta * 30);
		event.preventDefault();
	});

	$("#footer .arrow").on("click", function(){
		if($(this).hasClass("left")) {
			$("#footer .scroll").get(0).scrollLeft -= 30;
		} else if($(this).hasClass("right")){
			$("#footer .scroll").get(0).scrollLeft += 30;
		}
	});

	$("#change-time-btn").on("click", function(){
		var tab = null;
		if (LOCAL_STATE.last_sel_tab)
			tab = LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab];
		var interval = get_time_from_input();
		if (tab.time_from==interval[0] && tab.time_to==interval[1])
			return false;
		tab.time_from = interval[0];
		tab.time_to = interval[1];
		updateTabTime();
		return false;
	}).removeAttr("href");

	PLOT = $.plot("#plot", [],
		{
			xaxis:{show:false, min:-60},
			colors: ["#7c93b3"],
			zoom: {interactive: true},  pan: { interactive: true},
			yaxis:{min:0, max:5, ticks:ticks, panRange:false, zoomRange:false, autoscaleMargin:null },
			grid:{
				autoHighlight:true, hoverable:true, clickable:true,
				axisMargin:0, borderWidth:0, labelMargin:10,
				markings:LOCAL_STATE.criteria, margin:{top:30, bottom:20}
			}
		}
	);

	$(".date-time-content").on("resize", function(evt, w){
		w = (w || $(this).width()) - 40;
		var res = w - $("#dateinterval").width() - $(".trip-length").width();
		$("#item-info-block").width(res).children(".unit").css("max-width", res - 100);
	});

	$("#statistic").on("resize", hideSettings);

	$("#plot").bind("plothover", function (event, pos, item) {
		if (item){
			if (LOCAL_STATE.last_flot_hover == item.dataIndex){
				var off = PLOT.getPlotOffset();
				var x = item.datapoint.length === 3 ?
					(PLOT.p2c({x1:item.datapoint[0]+item.datapoint[2]/2}).left|0) - 95 + off.left:
					item.pageX - 95;
				if(x < 5)
					x = 5;
				else if( $(window).width()-x < 195 )
					x = $(window).width() - 195;
				$("#plot-hover").offset({ left: x});
				return;
			}
			LOCAL_STATE.last_flot_hover = item.dataIndex;
			toggleHover(item);
		} else if (LOCAL_STATE.last_flot_hover!=null) {
			LOCAL_STATE.last_flot_hover = null;
			toggleHover();
		}
	});

	$("#plot").bind("plotclick", function (event, pos, item) {
		if($("#ui-datepicker-div").css("display") == "block")
			$("#ui-datepicker-div").datepicker("hide");
		if (item){
			if (LOCAL_STATE.last_flot_click == item.dataIndex){
				if (MAP && LOCAL_STATE.map_bounds.length)
					MAP.fitBounds(LOCAL_STATE.map_bounds, {padding:[10,10]});
			} else {
				LOCAL_STATE.last_flot_click = item.dataIndex;
				showViolations(LOCAL_STATE.last_sel_tab, item.dataIndex);
				PLOT.unhighlight();
				PLOT.highlight(item.series, item.datapoint);
			}
		}
	});
});

/** Hide unit settings dialog
 */
function hideSettings(){
	var obj = $("#settings:visible");
	if(obj){
		obj.data("unit","").hide();
	}
}

/** Initialize MAP object
 */
function initMap() {
	var hiddenOSM = true;
	var user = wialon.core.Session.getInstance().getCurrUser();
	var gis_url = wialon.core.Session.getInstance().getBaseGisUrl();
	var user_id = user.getId();
	var sess = wialon.core.Session.getInstance();
	var gurtam = L.tileLayer.webGis(gis_url,{ attribution: APP_CONFIG.alias_webgis || "Gurtam Maps",minZoom: 4, userId: user_id, sessionId: sess.getId()});
	var osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	});

	// get map center from user settings
	var center = user.getCustomProperty('umsp', '28.49,53.505,6').split(',');
	center = {
		lng: parseFloat(center[0]) || 28.49,
		lat: parseFloat(center[1]) || 53.505,
		zoom: parseFloat(center[2]) || 6
	};

	var cur = gurtam;
	var layer = $.cookie("idrive-map");
	if (hiddenOSM && layer === 'OpenStreetMap') {
		layer = 'Gurtam Maps';
	}
	if (layer) {
		switch(layer){
			case APP_CONFIG.alias_webgis:
			case "Gurtam Maps": cur=gurtam; break;
			case "OpenStreetMap": cur=osm; break;
		}
	} else {
		$.cookie("idrive-map", APP_CONFIG.alias_webgis || "Gurtam Maps", {expires: 300});
	}

	MAP = L.map("map", {
		center: [center.lat, center.lng],
		zoom: center.zoom,
		layers: [cur]
	});

	MAP.addEventListener("baselayerchange", function(evt){ $.cookie("idrive-map", evt.name, {expires: 300}); });

	var layers = {};
	layers[APP_CONFIG.alias_webgis || "Gurtam Maps"] = gurtam;
	if (!hiddenOSM) {
		layers["OpenStreetMap"] = osm;
	}

	L.control.layers(layers).addTo(MAP);
}

/** Update tab content when time interval changed
 */
function updateTabTime(){
	var tab_id = LOCAL_STATE.last_sel_tab;
	var tab = LOCAL_STATE.tabs[tab_id];
	if (tab){
		if (tab.tab_type) { // unit tab update
			execute(tab_id.split("_")[2], true);

			cleanMap();
			$("#viol-table").html("");
			$("#viol-header").hide();
			$("#item-info-block .rate").html("");
			PLOT.setData([]);
			PLOT.unhighlight();
			PLOT.draw();
		} else { // stat tab update
			for (var i=0; i<tab.units.length; i++) {
				abortRequest(tab.units[i]);
				if(tab.units[i].timeout){ clearTimeout(tab.units[i].timeout); }
				tab.units[i].timeout = setTimeout(qx.lang.Function.bind(execute, this, tab.units[i].id, true), 1000);
				$("#row_"+tab.units[i].id).children(".rate, .mileage, .duration").html("<img src='./img/loader.gif'/>");
				$("#row_"+tab.units[i].id).children(".duration").attr("title","").removeClass("update");
			}
		}
	}
}

/** Change time handler
 *
 *  @param {Array} data   event params (check info below)
 *
 *  [
 *     value, // type of interval. Possible values: 0 - yesterday, 1 - today, 2 - week, 3 - month, 4 - custom
 *     interval // [from, to] date interval
 *  ]
 */
function changeTime(data) {
	var value = data[0], interval = data[1];

	var tab_id = LOCAL_STATE.last_sel_tab;
	if (LOCAL_STATE.tabs[tab_id]){
		LOCAL_STATE.tabs[tab_id].time_type = value;
		LOCAL_STATE.tabs[tab_id].time_from = interval[0];
		LOCAL_STATE.tabs[tab_id].time_to = interval[1];

		updateTabTime();
	}

	activateTimeTemplate(value);
}

/** Activate interval time ( tab labels )
 *
 *  @param {int} value   type of interval. Possible values: @see changeTime
 *  @returns {bool}   true - done without errors, false - activation failed
 */
function activateTimeTemplate(value){
	var label = $("#dateinterval").intervalWialon("label");

	var tab = LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab];
	if (tab && !tab.tab_type) {
		tab.name = label;
		$("#"+LOCAL_STATE.last_sel_tab)
			.html(value<4 ? label : $.localise.tr("Custom"))
			.attr("title", value<4 ? label.replace(/&ndash;/g, "-").replace(/&nbsp;/g, " ")  : $.localise.tr("Custom"));
	}

	$(".date-time-content").resize();
	return true;
}

/** Get data from server
 *
 *  @param {int} id   unit id
 *  @param {bool} update   if unit already shown on tab and need just update data without adding new row
 */
function execute(id, update) {
	if (!id) return;
	var interval = get_time_from_input(true);
	var tab = LOCAL_STATE.last_sel_tab;

	if (!id || !interval || interval.length!=2) return;

	if (!update) {
		if (addRowToTable(id))
			LOCAL_STATE.tabs[tab].units.push({"id":id, "xhr":null, "timeout":null});
	} else {
		LOCAL_STATE.tabs[tab].stat[id] = null;
		delete LOCAL_STATE.tabs[tab].stat[id];
	}

	var unit = findUnitOnTab(LOCAL_STATE.tabs[tab], id);
	abortRequest(unit);

	var sess = wialon.core.Session.getInstance();
	var token = sess.getToken();
	if (token && token.th) {
		// use new token for authorization
		sendRequest(id, unit, tab, interval, "token", token.th);
	} else {
		// use old authHash logic
		sess.createAuthHash(function(error, data){
			if (error || !data.authHash || !unit){
				if (unit !== null) {
					alert($.localise.tr("Error"));
				}
			} else {
				sendRequest(id, unit, tab, interval, "hash", data.authHash);
			}
		});
	}
}

/** Send request to server
 *
 * @param {int} id   unit id
 * @param {Object} unit
 * @param {Object} tab
 * @param {Array} interval   [time_from, time_to]
 * @param {String} type   'hash' or 'token'
 * @param {String} token   hash/token value
 */
function sendRequest(id, unit, tab, interval, type, token) {
	var s = wialon.core.Session.getInstance();
	var params =
		type + "=" + token +
		"&item=" + id +
		"&from=" + interval[0] +
		"&to="+interval[1] +
		"&url="+s.getBaseUrl() +
		"&sid="+s.getId();
	unit.xhr = $.ajax({
		"url": "/idrivesafe/get?" + params,
		"dataType": "json"
	})
	.done(qx.lang.Function.bind(handleData, this, tab, id))
	.fail( function(xhr, status){
		if (status != "abort") {
			qx.lang.Function.bind(handleData, this, tab, id, {error:-3});
		}
	})
	.error( function(xhr, status){
		if (status == "timeout") {
			handleData(tab, id, {error:-4});
		}
	});
	unit.xhr.hash = "" + token;

	if (tab == LOCAL_STATE.last_sel_tab && LOCAL_STATE.tabs[tab].tab_type)
		$("#overlay-tab").show();
}

/** Abort request if still pending
 *
 *  @param unit   internal {unit_on_tab} object, @see findUnitOnTab
 */
function abortRequest(unit){
	if (unit && unit.xhr){
		unit.xhr.abort();
		unit.xhr = null;
	}
}

/** Add unit row to statistic table
 *
 *  @param {int} id   unit id
 *  @returns {bool} whether the operation was successful
 */
function addRowToTable(id){
	var template = _.template($("#all-stat-row").html());
	var unit = findUnit(id);
	if (!unit)
		return false;
	$("#add-unit-btn").hide();
	var tmp = template({
		"id": id,
		"img": unit.getIconUrl(16),
		"name": unit.getName(),
		"settings": "img/unit_"+LOCAL_STATE.unit_opts[id][0]+".png"
	});
	$("#all-stat tbody").append(tmp);
	return true;
}

/** Handle data obtained from server ( @see execute )
 *
 *  @param {String} tab   tab id
 *  @param {int} id   unit id
 *  @param {object} data   json data about unit, obtained from server
 */
function handleData(tab, id, data) {
	var unit = findUnitOnTab(LOCAL_STATE.tabs[tab], id);
	if (!unit || !unit.xhr){
		return;
	}
	if (data.hash && unit.xhr && data.hash!=unit.xhr.hash){
		return;
	}

	unit.xhr = null;
	if (tab == LOCAL_STATE.last_sel_tab)
		$("#overlay-tab").hide();

	var  obj = data;
	if (data.error) {
		// nothing to do here: the error is shown in the statistic table (see populateStat)
	}

	if (!data.trips || data.trips.length === 0){
		obj.ia = obj.ib = obj.it = obj.na = obj.nb = obj.nt = null;
		obj.total_time = obj.R = obj.rate = obj.ka = obj.kb = obj.kt =null;
		obj.trips = [];
		obj.plot_trips = [];
	}

	LOCAL_STATE.tabs[tab].stat[id] =  obj;
	calculateStat(id, obj);

	if (LOCAL_STATE.last_sel_tab == tab)
		populateStat(tab, id);

	var cur = {};
	if (!LOCAL_STATE.tabs[tab].tab_type) {
		for (var itab in LOCAL_STATE.tabs) {
			cur = LOCAL_STATE.tabs[itab];
			if (!cur.tab_type || cur.parent!=tab) continue;
			if ( cur.time_from==LOCAL_STATE.tabs[tab].time_from && cur.time_to==LOCAL_STATE.tabs[tab].time_to){
				var u = findUnitOnTab(cur,id);
				if (!u) continue;
				abortRequest(u);
				cur.stat[id] = clone(LOCAL_STATE.tabs[tab].stat[id]);
				populateStat(itab, id);
				$("#overlay-tab").hide();
			}
		}
	}
}

/** Calculate statistic and rate for trips using information obtained from server
 *  Result saves to each trip ( obj.trips[i].rate )
 *
 *  @param {int} id   unit id
 *  @param {object} obj   json data about unit's trips, obtained from server
 */
function calculateStat(id, obj){
	if (!obj || !obj.trips || !obj.trips.length)
		return;

	var len = obj.trips.length, trip = {};

	var settings = SETTINGS[LOCAL_STATE.unit_opts[id][0]].p[LOCAL_STATE.unit_opts[id][1]];

	for (var i=0; i<len; i++) {
		trip = obj.trips[i];

		// violation cache
		if(!trip.viol){
			trip.viol = {};
			trip.viol.A = [];
			trip.viol.B = [];
			trip.viol.T = [];
		} else {
			trip.viol.A.length = 0;
			trip.viol.B.length = 0;
			trip.viol.T.length = 0;
		}

		trip.viol.A = getInvalidCount(trip.A, settings.a, "a");
		trip.ia = trip.viol.A.length;
		trip.viol.B = getInvalidCount(trip.B, settings.b, "b");
		trip.ib = trip.viol.B.length;
		trip.viol.T = getInvalidCount(trip.T, settings.t, "t");
		trip.it = trip.viol.T.length;

		trip.ka = trip.A.length>0 ? trip.ia/trip.A.length*100 : 0;
		trip.kb = trip.B.length>0 ? trip.ib/trip.B.length*100 : 0;
		trip.kt = trip.T.length>0 ? trip.it/trip.T.length*100 : 0;

		trip.ra = getNewInvalidCount(trip.A, settings.a);
		trip.rb = getNewInvalidCount(trip.B, settings.b);
		trip.rt = getNewInvalidCount(trip.T, settings.t);

		trip.R = trip.ra + trip.rb + trip.rt;
		trip.rate = 0.5*calculateRate(trip.R/((trip.to.t-trip.from.t)/3600)) +
					0.2*calculateVPMRate(trip.R/(trip.m/1000)) +
					0.3*rate(parseInt((trip.ka+trip.kb+trip.kt)/3,10));
	}

	filterTrips(obj);
}

/** Get array of violations filtered from all maneuvers array.
 *
 *  @param {Array} arr   all maneuvers array
 *  @param {int} maxValid   max allowed value
 *  @param {String} type   maneuver type ('a'-acceleration, 'b'-brake, 't'-turn)
 *  @returns {array} maneuvers filtered with following logic: arr[i].a > maxValid
 */
function getInvalidCount(arr, maxValid, type) {
	var len = arr.length, all = [];
	for (var i=0; i<len; i++){
		if (Math.abs(arr[i].a) > maxValid){
			if(!arr[i].type){
				arr[i].type = type;
			}
			all.push(arr[i]);
		}
	}
	return all;
}

/** Get overall violation sum filtered from all maneuvers array using additional weight
 *
 *  @param {Array} arr   all maneuvers array
 *  @param {int} maxValid   max allowed value
 *  @param {float} weight   additional weight of violations ( currently all violation types equals, k=1 )
 *  @returns {float} overall violation sum
 */
function getNewInvalidCount(arr, maxValid, k) {
	var len = arr.length, sum = 0, val = 0;
	k = k || 1;
	for (var i=0; i<len; i++){
		if (Math.abs(arr[i].a) > maxValid){
			val = arr[i].a * arr[i].a * k / (maxValid * maxValid);
			sum += val;
		}
	}
	return sum;
}

/** Calculate overall rate for all trips considering min trips length
 *  Result saves to obj.rate
 *
 *  @param {object} arr   json data about unit's trips, obtained from server
 *  @param {int} limit   min trip length
 */
function filterTrips(obj, limit){
	if (!obj || !obj.trips || !obj.trips.length)
		return;

	if (typeof limit == "undefined")
		limit = parseInt($("#trip-length-limit").slider("value"),10);

	var len = obj.trips.length;
	var trip=null, skip=0, time=0, ra=0, rb=0, rt=0, ia=0, ib=0, it=0, na=0, nb=0, nt=0, mileage=0;

	for (var i=0; i<len; i++) {
		trip = obj.trips[i];
		if ( ( limit>0 && trip.m < limit*1000 ) || ( trip.m === 0 ) ){
			skip++;
			continue;
		}

		ia += trip.ia;
		ib += trip.ib;
		it += trip.it;

		na += trip.A.length;
		nb += trip.B.length;
		nt += trip.T.length;

		time += trip.to.t - trip.from.t;
		mileage += trip.m;

		ra += trip.ra;
		rb += trip.rb;
		rt += trip.rt;
	}

	obj.ia = ia;
	obj.ib = ib;
	obj.it = it;

	obj.na = na;
	obj.nb = nb;
	obj.nt = nt;

	obj.ra = ra;
	obj.rb = rb;
	obj.rt = rt;

	obj.ka = obj.na>0 ? obj.ia/obj.na*100 : 0;
	obj.kb = obj.nb>0 ? obj.ib/obj.nb*100 : 0;
	obj.kt = obj.nt>0 ? obj.it/obj.nt*100 : 0;

	if (skip==len){
		obj.R = null;
		obj.K = null;
	} else {
		obj.R = ra + rb + rt;
		obj.K = parseInt((obj.ka+obj.kb+obj.kt)/3,10);
	}

	obj.total_time = time;
	obj.rate = calculateRate(obj.R/(time/3600))*0.5 + calculateVPMRate(obj.R/(mileage/1000))*0.2 + rate(obj.K)*0.3;
}

/** Calculate rate depending on weighted violations per hour
 *  This is one summand of overall rate (with 0.5 weight)
 *
 *  @param {float} x   weighted violations per hour
 *  @returns {float} ViolationsPerHour rate
 */
function calculateRate(x){
	if(!x)
		x = (x===0 ? 0 : -1);
	var y = [5, 4.5, 3, 2, 1];
	var max = [0, 5, 30, 80, 200];
	var rate = null;
	for(var i=0; i<max.length-1; i++){
		if ( max[i]<=x && x<max[i+1] ) {
			rate = (y[i]-y[i+1])/(max[i]-max[i+1]) * x + y[i] - (y[i]-y[i+1])*max[i]/(max[i]-max[i+1]);
			break;
		}
	}
	if (rate === null && x>=0) {
		rate = y[y.length-1] * max[max.length-1] / x;
	}
	return rate;
}

/** Calculate rate depending on weighted violations per mileage
 *  This is one summand of overall rate (with 0.2 weight)
 *
 *  @param {float} x   weighted violations per mileage
 *  @returns {float} ViolationsPerMileage rate
 */
function calculateVPMRate(x){
	if(!x)
		x = (x===0 ? 0 : -1);
	var y = [5, 4.5, 3, 2, 1];
	var max = [0, 0.25, 1, 1.5, 2.5];
	var rate = null;
	for(var i=0; i<max.length-1; i++){
		if ( max[i]<=x && x<max[i+1] ) {
			rate = (y[i]-y[i+1])/(max[i]-max[i+1]) * x + y[i] - (y[i]-y[i+1])*max[i]/(max[i]-max[i+1]);
			break;
		}
	}
	if (rate === null && x>=0) {
		rate = y[y.length-1] * max[max.length-1] / x;
	}
	return rate;
}

/** Calculate rate depending on violation / maneuvers
 *  This is one summand of overall rate (with 0.3 weight)
 *
 * @param {int} value   percent of violations
 * @returns {float} violation / maneuvers rate
 */
function rate(value) {
	var rating = value>=0 ? value : null;
	if( rating!=null )
		return rating>=0 && rating<=100 ? 5 - Math.round(rating/2,10)/10 : null;
	else
		return null;
}

/** Update info on tab after calculation (statistic or unit tab)
 *
 *  @param {String} tab   tab id
 *  @param {int} id   unit id
 *  @param {int} limit   min trip length
 *  @param {bool} leave   leave same trip selected (otherwise, select trip with min rate)
 */
function populateStat(tab, id, limit, leave){
	var tab_info = tab.split("_");

	if (tab_info.length==2) {
		var tag = $("#row_"+id), stat = LOCAL_STATE.tabs[tab].stat[id];
		var mileage = 0;
		if (LOCAL_STATE.tabs[tab].stat[id]) {
			if(stat.error){
				tag.children(".rate, .mileage, .duration").html("");
				tag.children(".duration").attr("title", $.localise.tr("Error while getting data")).addClass("update");
			} else {
				mileage = "-";
				if(stat.mileage){
					if (MEASURE == 1 || MEASURE == 2) {
						mileage = (stat.mileage * KM2MI / 1000).toFixed(1);
					} else {
						mileage = (stat.mileage / 1000).toFixed(1);
					}
				}
				tag.children(".duration").html( stat.duration ? toHHMMSS(stat.duration) : "-" );
				tag.children(".mileage").html(mileage);
				tag.children(".rate").html( (stat.rate ? "<img alt='' title='"+$.localise.tr("Rate")+" "+prettyPrint(stat.rate," / 5")+"' src='img/star_"+Math.round(2*stat.rate,10)+".png'/>" : "") +
					prettyPrint(stat.rate)
				);
			}
		} else {
			tag.children(".rate, .mileage, .duration").html("<img src='./img/loader.gif'/>");
			tag.children(".duration").attr("title","").removeClass("update");
		}
	} else if (tab_info.length==4) {
		showStatistic(tab, limit, leave);
	}
}

/* Show calculated statistic on unit tab
 *
 *  @param {String} tab   tab id
 *  @param {int} limit   min trip length
 *  @param {bool} leave   leave same trip selected (otherwise, select trip with min rate)
 */
function showStatistic(tab_id, limit, leave){
	var tab_info = tab_id.split("_");
	if (tab_info[0]!="tab" || tab_info.length!=4)
		return;

	var tab = LOCAL_STATE.tabs[tab_id];
	var unit = findUnit(tab_info[2]);
	if(!tab.stat[tab_info[2]] || !tab.stat[tab_info[2]].trips || !unit)
		return;

	if (limit == null || typeof limit == "undefined")
		limit = parseInt($("#trip-length-limit").slider("value"),10);

	cleanMap();
	toggleHover();
	$("#viol-table").html("");
	$("#viol-header").hide();

	$("#item-info-block .rate")
		.html(tab.stat[tab.units.id].rate ? tab.stat[tab.units.id].rate.toFixed(1) + "" : "&nbsp;")
		.attr("title", tab.stat[tab.units.id].rate!=null ? $.localise.tr("Rate")+" "+tab.stat[tab.units.id].rate.toFixed(1)+" / 5" : "");
	$("#item-info-block .unit").html(unit.getName());
	$("#item-info-block .settings img").prop("src", "img/unit_"+LOCAL_STATE.unit_opts[tab_info[2]][0]+".png");

	var from_to = $("#dateinterval").intervalWialon("label");
	var txt = " " + (MEASURE == 1 || MEASURE == 2 ? $.localise.tr("mi") : $.localise.tr("km"));
	var format_limit = (MEASURE == 1 || MEASURE == 2 ? (limit * KM2MI).toFixed(1) : limit);

	$("#plot-name").html(
		wialon.util.String.sprintf(
			$.localise.tr("Trips for %s ") + (limit>0 ? $.localise.tr("not shorter than %s") + txt : "%s") ,
			"<b><i>"+from_to+"</i></b>", (limit>0 ? "<b>"+format_limit+"</b>" : "")
	));
	var trips = tab.stat[tab_info[2]].trips;
	var K = [], max = trips.length, plot_trips = [];
	var select_index = 0, select_value = 6, limited_count = 0, total = 0, t = 0;
	for (var i=0; i<max; i++){
		if ( ( limit > 0 && trips[i].m < limit*1000 ) || ( trips[i].m === 0 ) ) {
			limited_count++;
			continue;
		}

		t = trips[i].to.t - trips[i].from.t;
		K.push([total, trips[i].rate > 0 ? trips[i].rate : 0.05, t]);
		total += t+60;
		plot_trips.push(i);
		if (trips[i].rate<select_value) {
			select_value = trips[i].rate;
			select_index = i-limited_count;
		}
	}

	$("#no-data").css("display", max==limited_count || max===0 ? "block" : "none");

	tab.stat[tab_info[2]].plot_trips = plot_trips;

	PLOT.unhighlight();
	PLOT.setData([{data:K, bars:{show:true, lineWidth:1, strokeColor:"rgba(255,255,255,0.5)", align:"left"}}]);
	var opts = PLOT.getXAxes()[0].options;
	opts.min = -60;
	opts.max = total;
	opts.panRange = [-61,total+1];
	opts.zoomRange = [600,total+62];
	if (K.length) {
		if(leave)
			select_index = LOCAL_STATE.last_flot_click;
		else
			LOCAL_STATE.last_flot_click = select_index;
		showViolations(tab_id, select_index);
	}
	PLOT.setupGrid();
	PLOT.draw();
	PLOT.highlight(0, select_index, true);
}

/** Construct menu and statistic tab
 *
 *  @param {String} id_tab   tab id
 *  @param {bool} after_sort   true - redraw after sort
 */
function showMenu(id_tab, after_sort){
	var tab = LOCAL_STATE.tabs[id_tab];
	if (tab.tab_type)
		return;
	$("#all-stat tbody").html("");
	$("#items .item").show();
	if (!after_sort) {
		$("#all-stat .sort:visible").css("display","none");
		if (tab.sort) {
			$("#sort_"+Math.abs(tab.sort)).next("img")
				.attr("src","img/"+(tab.sort>0?"az.png":"za.png"))
				.css("display","inline-block");
		}
	}
	if (tab.units.length) {
		$("#add-unit-btn").hide();
		for (var i=0; i<tab.units.length; i++) {
			$("#item_"+tab.units[i].id).hide();
			addRowToTable(tab.units[i].id);
			populateStat(id_tab, tab.units[i].id);
		}
	} else {
		$("#add-unit-btn").show();
	}
}

/** Resize unit list panel (drag handler)
 *
 *  @param {jQuery object} left   unit list
 *  @param {jQuery object} center   2px width vertical line between panels
 *  @param {jQuery object} right   statistic panel
 *  @param {int} width   window width
 *  @param {event}   mousemove drag event
 */
function resizePanel(left, center, right, width, e){
	var val = e.pageX;
	// left scroll offset
	var a = 0;
	// if horizontal scroll
	if (width < 1004) {
		a = $('body').scrollLeft();
	}
	// check right min size
	if(width - val + a < 50) {
		val = width + a - 50;
	}
	// check left min size
	if (val < a + 70) {
		val = a + 70;
	}
	if (width < 1004) {
		width = 1004;
	}
	// convert to percent
	var percent = val / (width) * 100;
	center.css("left", percent + "%");
	left.css("width", percent + "%");
	right.css("width", (100 - percent) + "%");

	return val;
}

/** Plot hover handler
 *
 *  @param {object} item   mouseover'ed item on plot
 */
function toggleHover(item) {
	var tab = LOCAL_STATE.tabs[ LOCAL_STATE.last_sel_tab ];
	if (!item || !tab.tab_type) {
		$("#plot").css("cursor", "default");
		$("#plot-hover").stop(0, 1).fadeOut(200);
	} else {
		$("#plot").css("cursor", "pointer");
		if (tab && tab.stat[tab.units.id]){
			var plot_index = tab.stat[tab.units.id].plot_trips[item.dataIndex];
			var stat = tab.stat[tab.units.id].trips[plot_index];
			var obj = $("#plot-hover");

			var from_to = formatDateRange(
				wialon.util.DateTime.formatTime(stat.from.t, false, DATE_FORMAT),
				wialon.util.DateTime.formatTime(stat.to.t, false, DATE_FORMAT)
			);

			var trip = " ";
			if (MEASURE == 1 || MEASURE == 2) {
				trip += (stat.m * KM2MI / 1000).toFixed(1) + " " + $.localise.tr("mi");
			} else {
				trip += (stat.m / 1000).toFixed(1) + " " + $.localise.tr("km");
			}
			obj.find(".time").html(from_to);
			obj.find(".rate").html("<img alt='' title='"+$.localise.tr("Rate")+" "+prettyPrint(stat.rate," / 5")+"' " +
				"src='img/star_"+Math.round(2*stat.rate,10)+".png'/> " + prettyPrint(stat.rate," / 5"));
			obj.find(".mileage").html($.localise.tr("Trip length") + trip  + ", " + toHHMMSS(stat.to.t - stat.from.t));

			obj.find(".a").html(stat.ia);
			obj.find(".b").html(stat.ib);
			obj.find(".t").html(stat.it);

			var x = item.datapoint.length === 3 ?
				(PLOT.p2c({x1:item.datapoint[0]+item.datapoint[2]/2}).left|0) - 95 + PLOT.getPlotOffset().left:
				item.pageX - 95;
			if(x < 5)
				x = 5;
			else if( $(window).width()-x < 195 )
				x = $(window).width() - 195;
			obj.stop(0, 1).fadeIn(100).offset({ left: x });
		} else {
			$("#plot-hover").stop(0, 1).fadeOut(200);
		}
	}
}

/** Convert seconds to pretty time label
 *
 *  @param {int} sec   seconds
 *  @returns {String} formatted 'hh:mm:ss' string
 */
function toHHMMSS(sec) {
	sec = sec | 0;
	var hours   = Math.floor(sec / 3600);
	var minutes = Math.floor((sec - (hours * 3600)) / 60);
	var seconds = sec - (hours * 3600) - (minutes * 60);

	if (hours   < 10) {hours   = "0"+hours;}
	if (minutes < 10) {minutes = "0"+minutes;}
	if (seconds < 10) {seconds = "0"+seconds;}
	var time    = hours+':'+minutes+':'+seconds;
	return time;
}

/** Toggle settings dialog
 *
 *  @param {jQuery object} tag   near what object show dialog
 *  @param {int} id   unit id
 */
function toggleSettingsDialog(tag, id){
	var obj = $("#settings");
	if (tag && id && id != obj.data("unit")) {
		$("#unit-type").val(LOCAL_STATE.unit_opts[id][0]);
		var rig = $("#rigor td.selected");
		rig.css("background-image","url('img/"+rig.attr("id")+".png')").removeClass("selected");
		rig = $("#rigor_"+LOCAL_STATE.unit_opts[id][1]);
		rig.css("background-image","url('img/"+rig.attr("id")+"_a.png')").addClass("selected");

		var off = $(tag).offset();
		var css = {};
		css.right = $(window).width() - off.left - $(tag).width();

		css.top = off.top + 30;
		if (css.top + $("#settings").height() + 12 > $(window).height() - 40) {
			css.top = off.top - $("#settings").height() - 12;
		}
		obj.data("unit",id).css(css).show();
	} else {
		id = obj.data("unit");

		var unit = findUnit(id);
		if (!unit || !id)
			return;
		unit.updateCustomProperty("idrive", LOCAL_STATE.unit_opts[id].join(";"));
		obj.data("unit","").hide();
	}
}

/** Populate violation for selected trip
 *
 *  @param {String} id   tab id
 *  @param {int} ind   index of trip (0 <= ind < trips.length)
 */
function showViolations(id, ind) {

	cleanMap();

	var tab = LOCAL_STATE.tabs[id];
	var plot_index = tab.stat[tab.units.id].plot_trips[ind];
	var trip = tab.stat[tab.units.id].trips[plot_index];
	var sess = wialon.core.Session.getInstance();
	var ml = sess.getMessagesLoader();
	if (MAP)
		ml.loadInterval(tab.units.id, trip.from.t, trip.to.t, 1, 1, 0xFFFFF,
			qx.lang.Function.bind(function(tab, plot_index, code, data){
				if (LOCAL_STATE.last_sel_tab == tab && LOCAL_STATE.last_flot_click == ind && !code) {
					var i = 0;
					for(i=0; i<MULTIPOLY.length; i++){
						if (MULTIPOLY[i]) {
							MAP.removeLayer(MULTIPOLY[i]);
						}
					}

					var multipoly = [[],[],[],[],[]], poly = [];
					var index = 0, cur = [], cur_index = null;
					i=0;
					while( i<data.messages.length ){
						if (data.messages[i].pos && data.messages[i].pos.x && data.messages[i].pos.y){
							index = getSpeedIndex(data.messages[i].pos.s);
							if (index != cur_index) {
								if (cur_index>=0 && cur.length) {
									cur.push(L.latLng(data.messages[i].pos.y, data.messages[i].pos.x));
									multipoly[cur_index].push(cur);
									cur = [];
								}
								cur_index = index;
							}
							cur.push(L.latLng(data.messages[i].pos.y, data.messages[i].pos.x));
							poly.push(L.latLng(data.messages[i].pos.y, data.messages[i].pos.x));
						}
						i++;
					}
					if (cur_index>=0 && cur.length) {
						multipoly[cur_index].push(cur);
					}

					var bounds = new L.LatLngBounds();
					for (i=0; i<multipoly.length; i++) {
						if (multipoly[i].length) {
							MULTIPOLY[i] = new L.MultiPolyline(multipoly[i], {
								color:LOCAL_STATE.speed_color[i],opacity:0.9,clickable:false,weight:6
							}).addTo(MAP);
							bounds.extend(MULTIPOLY[i].getBounds());
						}
					}
					if(!LOCAL_STATE.map_bounds.length){
						LOCAL_STATE.map_bounds = [
							[bounds.getNorth(), bounds.getEast()],
							[bounds.getSouth(), bounds.getWest()]
						];
						MAP.fitBounds(bounds, {padding:[10,10]});
					}
				}
			}, null, id, ind)
		);

	var bounds = [];
	var template = _.template($("#viol-row").html());
	var html = [];
	var viol = getAllViolations(id, plot_index);
	var t = "";
	var m = null;

	if (viol.length === 0) {
		html.push("<tr class='no_violations'><td>" + $.localise.tr("No violations") + "</td></tr>");
	} else {
		var prev = [], dxy = 0, XY = 0.00001, text = "";
		for (var i=0; i<viol.length; i++) {
			if ( i>0 && prev[0]==viol[i].y && prev[1]==viol[i].x)
				dxy++;
			else
				dxy = 0;
			prev = [viol[i].y,viol[i].x];
			text = generateViolationLabel(viol[i]);
			t = wialon.util.DateTime.formatTime(viol[i].t, false, DATE_FORMAT);
			var tmp = template({
				"id": id,
				"ind": i,
				"num": i+1,
				"time": t.replace("_", " "),
				"text": text,
				"type": viol[i].type,
				"x": viol[i].x,
				"y": viol[i].y,
				"index": i
			});
			t = t.split("_");
			if (t.length==2)
				t = "<i><b>" + t[0] + "</b> " + t[1]+"</i>";
			else
				t = t.join(" ");
			m = L.marker([viol[i].y + dxy*XY, viol[i].x + dxy*XY],{riseOnHover: true, icon:
				new L.NumberedDivIcon({
					number: i+1,
					iconUrl: "img/"+viol[i].type+".png",
					iconSize: [30, 42],
					iconAnchor: [15, 42]
				})
			}).bindPopup(t + "<div class='"+viol[i].type+"'>"+text+"</div>").addTo(MAP);
			m.viol = id+"_"+i;

			m.on("popupopen", highlightViolation);

			MARKERS.push(m);
			bounds.push([viol[i].y, viol[i].x]);
			html.push(tmp);
		}
	}

	LOCAL_STATE.map_bounds = bounds;
	if (bounds.length)
		MAP.fitBounds(bounds, {padding:[10,10]});

	$("#viol-table").html(html.join("")).parent().scrollTop();

	tab = LOCAL_STATE.tabs[id];
	trip = tab.stat[tab.units.id].trips[plot_index];
	var from_to = formatDateRange(
		wialon.util.DateTime.formatTime(trip.from.t, false, DATE_FORMAT),
		wialon.util.DateTime.formatTime(trip.to.t, false, DATE_FORMAT)
	);
	$("#viol-header").show().children("span").html(
		"<span class='label'>"+$.localise.tr("Violations of the trip")+"</span> <i>" + from_to + "</i>"
	);
}

/** Get color index to colorize track by speed
 *
 *  @param {String} speed   speed in kilometers
 */
function getSpeedIndex(speed){
	speed = (!speed || speed < 0) ? 0 : speed;
	if (MEASURE == 1 || MEASURE == 2) {
		speed = speed * KM2MI;
	}
	var index = null;
	for (var i=0; i<LOCAL_STATE.speed_limit.length-1; i++ ) {
		if (LOCAL_STATE.speed_limit[i]<=speed && speed<LOCAL_STATE.speed_limit[i+1]) {
			index = i;
			break;
		}
	}
	if (index === null && LOCAL_STATE.speed_limit[LOCAL_STATE.speed_limit.length-1]<=speed) {
		index = LOCAL_STATE.speed_limit.length-1;
	}
	return index;
}

/** Get label for violation
 *
 *  @param {object} viol   violation object
 *  @returns {String} pretty violation label
 */
function generateViolationLabel(viol){
	var text = "";
	if(viol.type=="a" || viol.type=="b") {
		if (MEASURE == 1 || MEASURE == 2) {
			text = wialon.util.String.sprintf(
				$.localise.tr("( %s mph for %s s )"),
				Math.abs(viol.delta * KM2MI).toFixed(1), viol.dt
			);
		} else {
			text = wialon.util.String.sprintf(
				$.localise.tr("( %s km/h for %s s )"),
				Math.abs(viol.delta), viol.dt
			);
		}
	} else {
		if (MEASURE == 1 || MEASURE == 2) {
			text = "( <b>" + (viol.s * KM2MI).toFixed(1) + "</b> " + $.localise.tr("mph") + ")";
		} else {
			text = "( <b>" + viol.s + "</b> " + $.localise.tr("km/h") + ")";
		}
	}
	return getViolationText(viol.type) + " " + text;
}

/** Delete markers and polylines from map
 */
function cleanMap(){
	LOCAL_STATE.map_bounds = [];
	var i=0;
	for(i=0; i<MARKERS.length; i++)
		MAP.removeLayer(MARKERS[i]);
	MARKERS = [];
	for(i=0; i<MULTIPOLY.length; i++){
		if (MULTIPOLY[i]) {
			MAP.removeLayer(MULTIPOLY[i]);
		}
		MULTIPOLY[i] = null;
	}
}

/** Highlight violation marker and row in table, scroll table if needed
 */
function highlightViolation(){
	if (this._popup._isOpen) {
		var t = $("#viol-table tr.selected");
		if (t.size()) {
			t.removeClass("selected");
			$(MARKERS[t.data("index")]._icon).children(".number").removeClass("selected");
		}
		$("#viol_"+this.viol).addClass("selected");
		$(MARKERS[$("#viol_"+this.viol).data("index")]._icon).children(".number").addClass("selected");

		var viol = this.viol.split("_");
		var num = parseInt(viol[viol.length-1],10);
		var cont = $(".viol-table-container");
		var scroll = cont.scrollTop();

		if(num * 25 < scroll)
			cont.animate({
				scrollTop: 25 * num
			},200);
		else if (scroll + cont.height() < (num+1) * 25)
			cont.animate({
				scrollTop: (num+1) * 25 - cont.height()
			},200);
	}
}

/** Construct and return array of violations
 *  Concat accel, brake and turns violations and sort them
 *
 *  @param {String} id   tab id
 *  @param {int} ind   index of trip (0 <= ind < trips.length)
 *  @returns {Array} 3 types of violation together, sorted by time
 */
function getAllViolations(id, ind){
	var tab_info = id.split("_");
	if(tab_info.length != 4)
		return [];
	var viol = LOCAL_STATE.tabs[id].stat[tab_info[2]].trips[ind].viol;
	var all_v = viol.A.concat( viol.B, viol.T);
	wialon.util.Helper.sortItems(all_v, function(a) {return ""+a.t;});
	return all_v;
}

/** Generate violation text (using underscore.memoize)
 *
 *  @param {String} type   violation type
 *  @returns {String} translated violation text
 */
var getViolationText = _.memoize(function (type) {
	var txt = "";
	switch (type) {
		case "a": txt = $.localise.tr("Acceleration"); break;
		case "b": txt = $.localise.tr("Brake"); break;
		case "t": txt = $.localise.tr("Turn"); break;
		default: txt = $.localise.tr("Unknown");
	}
	return txt;
});

/** Find unit in cache
 *
 *  @param {int} id   unit id
 *  @returns {avl_unit || null} wialon unit object
 */
function findUnit(id){
	if(LOCAL_STATE.item_cache["avl_unit"]){
		var len = LOCAL_STATE.item_cache["avl_unit"].length;
		for (var i=0; i<len; i++)
			if(LOCAL_STATE.item_cache["avl_unit"][i].getId()==id)
				return LOCAL_STATE.item_cache["avl_unit"][i];
	}
	return null;
}

/** Find unit on tab
 *
 *  @param {object} tab   internal tab object (@see LOCAL_STATE.tabs)
 *  @param {int} id   unit id
 *  @returns {object} internal unit object
 */
function findUnitOnTab(tab, id){
	if (tab){
		if(tab.tab_type)
			return tab.units.id==id ? tab.units : null;
		else
			for (var i=0; i<tab.units.length && tab; i++)
				if(tab.units[i].id==id)
					return tab.units[i];
	}
	return null;
}

/** Get unique color for new tab
 *
 *  @returns {int} index of color (@see LOCAL_STATE.colors)
 */
function getColor(){
	for (var ind in LOCAL_STATE.colors)
		if(ind>0 && !(LOCAL_STATE.color_in_use & ind)){
			LOCAL_STATE.color_in_use = LOCAL_STATE.color_in_use | ind;
			return ind;
		}
	return 0;
}

/** Save/remove unit id to cookie
 *
 *  @param {int} id   unit id
 *  @param {bool} remove   true - remove from cookie
 */
function toggleCookie(id, remove){
	var ids = $.cookie("idrive");
	ids = ids ? ids.split(",") : [];
	var ind = ids.indexOf(id);
	var update = false;
	if(remove) {
		if (ind != -1){
			ids.splice(ind, 1);
			update = true;
		}
	} else if (ind == -1) {
		ids.push(id);
		update = true;
	}
	if (update)
		$.cookie("idrive", ids.join(","), {expires: 300});
}

/** Sort units on tab
 *
 *  @param {object} tab   internal tab object (@see LOCAL_STATE.tabs)
 */
function sortUnits(tab) {
	var sort = Math.abs(tab.sort);
	switch (sort) {
		case 1: // sort by unit name
			tab.units.sort(sortBy(
				function(x){ var u = findUnit(x); return u ? u.getName().toUpperCase() : ""; },
				"id", tab.sort>0)
			);
		break;
		case 2: //sort by rate
			tab.units.sort(sortBy(
				function(x){
					return tab.stat[x] && tab.stat[x].rate!==null ? tab.stat[x].rate : -1; },
				"id", tab.sort>0)
			);
		break;
		case 3: //sort by mileage
			tab.units.sort(sortBy(
				function(x){ return tab.stat[x] && tab.stat[x].mileage ? tab.stat[x].mileage : -1; },
				"id", tab.sort>0)
			);
		break;
		case 4: // sort by settings
			tab.units.sort(sortBy(
				function(x){ return LOCAL_STATE.unit_opts[x] && LOCAL_STATE.unit_opts[x].length==2 ? LOCAL_STATE.unit_opts[x][0]*3 + LOCAL_STATE.unit_opts[x][1]: -1; },
				"id", tab.sort>0)
			);
		break;
		case 5: // sort by duration
			tab.units.sort(sortBy(
				function(x){ return tab.stat[x] && tab.stat[x].duration ? tab.stat[x].duration : -1; },
				"id", tab.sort>0)
			);
		break;
	}
}

/** Helper for sort by object.field
 */
function sortBy(getter, field, reverse){
	var key = function(x){ return getter(x[field]); };
	return function (a,b) {
		var A = key(a), B = key(b);
		return ((A < B) ? -1 : (A > B) ? +1 : 0) * [-1,1][+!!reverse];
	};
}

/** Add new tab
 *
 *  @param {String} tab_id   tab id
 */
function addTab(tab_id) {
	var tab_info = tab_id.split("_");
	if ( tab_info[0]!="tab" || (tab_info.length!=2 && tab_info.length!=4) )
		return;

	var parent_tab = "";
	if (tab_info.length == 4)
		parent_tab = "tab_"+tab_info[1];

	var tab = LOCAL_STATE.tabs[tab_id];
	if (!tab){
		var obj = {stat:{}};
		obj.tab_type = tab_info.length == 4 ? 1 : 0; // 0 - Statistic, 1 - Unit
		var unit = null;
		if (obj.tab_type) {
			// unit tab
			var tab_unit = findUnitOnTab(LOCAL_STATE.tabs[parent_tab], tab_info[2]);
			unit = findUnit(tab_info[2]);
			if (!unit)
				return;
			obj.units = {};
			obj.units.id = tab_info[2];
			obj.units.xhr = tab_unit ? tab_unit.xhr : null;
			obj.stat[tab_info[2]] = clone(LOCAL_STATE.tabs[parent_tab].stat[tab_info[2]]);
			obj.name = unit.getName();
			obj.time_type = LOCAL_STATE.tabs[parent_tab].time_type;
			obj.time_from = LOCAL_STATE.tabs[parent_tab].time_from;
			obj.time_to = LOCAL_STATE.tabs[parent_tab].time_to;
			obj.color = LOCAL_STATE.tabs[parent_tab].color;
			obj.parent = parent_tab;
		} else {
			// statistic tab
			obj.units = [];
			obj.name = "";
			obj.time_type = $("#dateinterval").intervalWialon("type");
			var interval = get_time_from_input();
			obj.time_from = interval[0];
			obj.time_to = interval[1];
			obj.color = getColor();
			obj.sort = 0;
		}
		LOCAL_STATE.tabs[tab_id] = obj;

		var template = _.template($("#item-tab-template").html());

		var tmp = template({
			"id": tab_id,
			"cls": parent_tab ? parent_tab : tab_id+" limited-tab",
			"name": LOCAL_STATE.tabs[tab_id].name,
			"title": LOCAL_STATE.tabs[tab_id].name,
			"close": tab_id === "tab_0" ? false : true,
			"color": LOCAL_STATE.colors[obj.color],
			"tab_type": obj.tab_type,
			"img": unit ? unit.getIconUrl(16) : false
		});

		if ($("#tabs ."+(parent_tab ? parent_tab : tab_id)).size()){
			$("#tabs ."+(parent_tab ? parent_tab : tab_id)).last().parent().after(tmp);
		} else {
			$("#tabs .add-tab-container").before(tmp);
		}
		$("#footer .scroll").resize();
	}
	switchTab(tab_id);
}

/** Switch to tab and change whole page content
 *
 *  @param {String} tab_id   tab id
 */
function switchTab(tab_id){
	var old_tab = LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab];
	var tab = LOCAL_STATE.tabs[tab_id];

	if (LOCAL_STATE.last_sel_tab == tab_id)
		return false;

	if(LOCAL_STATE.last_sel_tab)
		$("#"+LOCAL_STATE.last_sel_tab).removeClass("active").parent().removeClass("item-selected");
	var tab_html = $("#"+tab_id);
	var footer = $("#footer .scroll");
	tab_html.addClass("active").parent().addClass("item-selected");
	var off = tab_html.offset();
	var scroll = footer.scrollLeft();
	if( scroll > off.left - 20 ){
		footer.scrollLeft( scroll + off.left - 20 );
	} else if ( footer.width() < off.left + tab_html.parent().width() - 20 ) {
		footer.scrollLeft( scroll + off.left + tab_html.parent().width() - 20 - footer.width() );
	}

	if(old_tab && old_tab.tab_type)
		$("#"+LOCAL_STATE.last_sel_tab).parent().css({
			"border-top-color": LOCAL_STATE.colors[old_tab.color],
			"border-bottom-color": ""
		});

	if(tab.tab_type){
		tab_html.parent().css({"border-bottom-color":LOCAL_STATE.colors[tab.color],"border-top-color":""});
		var ka = tab.stat[tab.units.id] && tab.stat[tab.units.id].rate ? tab.stat[tab.units.id].rate.toFixed(1) : "";
		$("#item-info-block").show().children(".rate").html(ka);
	} else {
		$("#item-info-block").hide();
	}

	LOCAL_STATE.tab_history.push(tab_id);

	LOCAL_STATE.last_sel_tab = tab_id;
	LOCAL_STATE.last_flot_click = null;
	PLOT.unhighlight();

	$("#dateinterval").intervalWialon("set", tab.time_type, [tab.time_from, tab.time_to], true);
	activateTimeTemplate(parseInt(tab.time_type, 10));

	if(tab.tab_type) {
		$("#stat-tab").css("display","none");
		$("#item-tab").css("display","block");
		PLOT.resize();
		if(tab.units.xhr)
			$("#overlay-tab").show();
		else
			$("#overlay-tab").hide();
		if (!MAP)
			initMap();
		showStatistic(tab_id);
		MAP.invalidateSize();
	} else {
		$("#stat-tab").css("display","block");
		$("#item-tab").css("display","none");
		$("#overlay-tab").hide();
		showMenu(tab_id);
	}

	return false;
}

/** Close tab
 *
 *  @param {String} tab_id   tab id
 */
function closeTab(tab_id){
	var cls = tab_id.split("_");
	if (cls.length == 2)
		cls = tab_id;
	else
		cls = "";
	var tab = LOCAL_STATE.tabs[LOCAL_STATE.last_sel_tab];
	if (LOCAL_STATE.last_sel_tab == tab_id || (cls && tab.parent==cls)) {
		var history = "tab_0";
		for (var i=LOCAL_STATE.tab_history.length-1, t=""; i >= 0; i--) {
			t = LOCAL_STATE.tab_history[i];
			if (t in LOCAL_STATE.tabs) {
				if (t == tab_id || (cls && LOCAL_STATE.tabs[t].parent==cls)) {
					continue;
				} else {
					history = t;
					break;
				}
			}
		}
		switchTab(history);
		LOCAL_STATE.last_sel_tab = history;
	}
	if (LOCAL_STATE.tabs[tab_id]) {
		if (cls) {
			LOCAL_STATE.color_in_use = LOCAL_STATE.color_in_use ^ LOCAL_STATE.tabs[tab_id].color;
		}
		LOCAL_STATE.tabs[tab_id] = null;
		delete LOCAL_STATE.tabs[tab_id];
	}

	if (cls) {
		$("#tabs ."+cls).parent().remove();
	} else {
		$("#"+tab_id).parent().remove();
	}
	$("#footer .scroll").resize();
	return false;
}

/** Pretty print value
 *
 *  @param {int} value   value for formatting
 *  @param {String} add   additional text (add if value not null)
 *  @returns {String} pretty text
 */
function prettyPrint(value, add) {
	return value==null ? "-" : value.toFixed(1)+(add?add:"");
}

/** Format abs time to local time
 *
 *  @param {int} abs_time   UNIX time UTC
 *  @param {int} tz   timezone offset
 *  @param {int} dst   DST
 *  @returns {int} local time
 */
function get_user_time(abs_time, tz, dst) {
	if(typeof wialon == "undefined")
		return abs_time;
	var t = abs_time - get_local_timezone() + tz + dst;
	return t;
}

/** Get local timezone
 *
 *  @returns {int} local timezone
 */
function get_local_timezone() {
	var rightNow = new Date();
	var jan1 = new Date(rightNow.getFullYear(), 0, 1, 0, 0, 0, 0);  // jan 1st
	var june1 = new Date(rightNow.getFullYear(), 6, 1, 0, 0, 0, 0); // june 1st
	var temp = jan1.toGMTString();
	var jan2 = new Date(temp.substring(0, temp.lastIndexOf(" ")-1));
	temp = june1.toGMTString();
	var june2 = new Date(temp.substring(0, temp.lastIndexOf(" ")-1));
	var std_time_offset = ((jan1 - jan2) / (1000 * 60 * 60));
	var daylight_time_offset = ((june1 - june2) / (1000 * 60 * 60));
	var dst;
	if (std_time_offset == daylight_time_offset) {
		dst = "0"; // daylight savings time is NOT observed
	} else {
		// positive is southern, negative is northern hemisphere
		var hemisphere = std_time_offset - daylight_time_offset;
		if (hemisphere >= 0)
			std_time_offset = daylight_time_offset;
		dst = "1"; // daylight savings time is observed
	}
	return parseInt(std_time_offset*3600,10);
}

/** Make Date and time format compatible with SDK timeFormat
 *
 *  @param {String} date   string representation of date
 *  @param {String} time   string representation of time
 *  @returns {String} string representation of date-time
 */
function rightFormat(date, time){
	date = "" + date;
	return convertDateFormat(date) + "_" + time;
}

/** Convert date format to Wialon compatible
 *
 *  @param {String} format   string representation of date
 *  @param {String} mode   convert direction
 *  @return {String} converted format
 */
function convertDateFormat(format, mode) {
	var i = 0;
	var tokens = {
		"MM": "%B",// The full month name. ("January" to "December")
		"M": "%b",// Abbreviated month name. ("Jan" to "Dec")
		"DD": "%A",// The full day name. ("Monday" to "Sunday")
		"D": "%a",// Abbreviated day name. ("Mon" to "Sun")
		"dd": "%E",// The day of the month with leading zero if required. ("01" to "31")
		"d": "%e",// The day of the month between 1 and 31. ("1" to "31")
		"yy": "%Y",// The full four digit year. ("1999" or "2008")
		"y": "%y"// The year as a two-digit number. ("99" or "08")
	};
	if (!mode) {
		for (i in tokens) {
			format = format.replace(new RegExp(i, "g"), tokens[i]);
		}
		// fix for 'mm-dd-yy' formatter
		var old = format;
		format = format.replace(new RegExp("mm", "g"), "%m");
		if ((old == format) || (format.indexOf("m") != format.indexOf("%m") + 1)) {
			format = format.replace(new RegExp("m", "g"), "%l");
		}
	} else {
		tokens.mm = "%m";
		tokens.m = "%l";
		for (i in tokens) {
			format = format.replace(new RegExp(tokens[i], "g"), i);
		}
	}
	return format;
}

/** Format from-to interval to pretty string, skipping same date and hide time if needed
 *
 *  @param {String} from   string representation of from date
 *  @param {String} to   string representation of to date
 *  @param {bool} date_only   if needed only date (without time)
 *  @returns {String} pretty string representation of interval
 */
function formatDateRange(from, to, date_only){
	var f = (""+from).split("_"), t = (""+to).split("_");
	if (f.length==2 && t.length==2) {
		if (f[0]==t[0])
			return "<i><b>" + f[0] + "</b> " + (date_only ? "" : f[1] + " &ndash; " + t[1]) + "</i>";
		else
			return "<i><b>" + f[0] + "</b> " + (date_only ? "" : f[1]) + " &ndash; <b>" +
				t[0] + "</b> " +(date_only ? "" : t[1]) + "</i>";
	} else
		return "<i>" + from + " &ndash; " + to + "</i>";
}

/** Get time from the user input
 *
 *  @param {bool} is_send   if interval will be send directly to Wialon
 *  @returns {Array} [from, to] interval
 */
function get_time_from_input (is_send) {
	return $("#dateinterval").intervalWialon("get", is_send);
}

/** Clone object
 *
 * @param {object} obj   object to be cloned
 * @returns {object} clone of input object
 */
function clone(obj) {
	var target = {};
	for (var i in obj) {
		if (obj.hasOwnProperty(i)) {
			target[i] = obj[i];
		}
	}
	return target;
}
