/**
 * echarts组件：提示框
 *
 * @desc echarts基于Canvas，纯Javascript图表库，提供直观，生动，可交互，可个性化定制的数据统计图表。
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         Yi Shen(https://github.com/pissang)
 * TODO
 *     Polar axis
 *     指定 triggerAxis
 */
define(function (require) {
    var Base = require('./base');
    
    var zrConfig = require('zrender/config');
    var zrEvent = require('zrender/tool/event');
    var zrArea = require('zrender/tool/area');
    var zrColor = require('zrender/tool/color');
    var zrUtil = require('zrender/tool/util');
    var zrShapeBase = require('zrender/shape/Base');
    
    // 图形依赖
    var CrossShape = require('../util/shape/Cross');
    var LineShape = require('zrender/shape/Line');
    var RectangleShape = require('zrender/shape/Rectangle');
    var rectangleInstance = new RectangleShape({});
    
    var ecData = require('../util/ecData');
    var ecQuery = require('../util/ecQuery');
    var query = ecQuery.query;
    var deepQuery = ecQuery.deepQuery;
    var queryValue = ecQuery.queryValue;
    
    var ecConfig = require('../config');
    var ecNumber = require('../util/number');

    var numAddCommas = ecNumber.addCommas;

    // 提示框
    ecConfig.tooltip = {
        zlevel: 1,                  // 一级层叠，频繁变化的tooltip指示器在pc上独立一层
        z: 8,                       // 二级层叠
        show: true,
        showContent: true,         // tooltip主体内容
        trigger: 'item',           // 触发类型，默认数据触发，见下图，可选为：'item' ¦ 'axis'
        // position: null          // 位置 {Array} | {Function}
        // formatter: null         // 内容格式器：{string}（Template） ¦ {Function}
        islandFormatter: '{a} <br/>{b} : {c}',  // 数据孤岛内容格式器
        showDelay: 20,             // 显示延迟，添加显示延迟可以避免频繁切换，单位ms
        hideDelay: 100,            // 隐藏延迟，单位ms
        transitionDuration: 0.4,   // 动画变换时间，单位s
        enterable: false,
        backgroundColor: 'rgba(0,0,0,0.7)',     // 提示背景颜色，默认为透明度为0.7的黑色
        borderColor: '#333',       // 提示边框颜色
        borderRadius: 4,           // 提示边框圆角，单位px，默认为4
        borderWidth: 0,            // 提示边框线宽，单位px，默认为0（无边框）
        padding: 5,                // 提示内边距，单位px，默认各方向内边距为5，
                                   // 接受数组分别设定上右下左边距，同css
        axisPointer: {             // 坐标轴指示器，坐标轴触发有效
            type: 'line',          // 默认为直线，可选为：'line' | 'shadow' | 'cross'
            lineStyle: {           // 直线指示器样式设置
                color: '#48b',
                width: 2,
                type: 'solid'
            },
            crossStyle: {
                color: '#1e90ff',
                width: 1,
                type: 'dashed'
            },
            shadowStyle: {                      // 阴影指示器样式设置
                color: 'rgba(150,150,150,0.3)', // 阴影颜色
                width: 'auto',                  // 阴影大小
                type: 'default'
            }
        },
        textStyle: {
            color: '#fff'
        }
    };

    function encodeHTML(source) {
        return String(source)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');   
    }

    var tplVariables = ['a', 'b', 'c', 'd', 'e'];
    function stringFormatter(tpl, seriesValues) {
        var str = tpl;
        for (var k = 0; k < tplVariables.length; k++) {
            str = str.replace(
                '{' + tplVariables[k] + '}',
                '{' + tplVariables[k] + '0}'
            );
        }
        for (var i = 0; i < seriesValues.length; i++) {
            var values = seriesValues[i];
            for (var k = 0; k < values.length; k++) {
                str = str.replace(
                    '{' + tplVariables[k] + i + '}',
                    values[k] 
                );
            }
        }
        return str;
    }

    // 通用样式
    var gCssText = 'position:absolute;display:block;border-style:solid;white-space:nowrap;';
    /**
     * 构造函数
     * @param {Object} messageCenter echart消息中心
     * @param {ZRender} zr zrender实例
     * @param {Object} option 提示框参数
     * @param {HtmlElement} dom 目标对象
     * @param {ECharts} myChart 当前图表实例
     */
    function Tooltip(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        
        this.dom = myChart.dom;
        
        var self = this;
        var shapeList = self.shapeList; 

        zr.on(zrConfig.EVENT.MOUSEMOVE, self._onmousemove, self);
        zr.on(zrConfig.EVENT.GLOBALOUT, self._onglobalout, self);

        // Adding context
        self._hide = zrUtil.bind(self._hide, self);
        self._tryShow = zrUtil.bind(self._tryShow, self);
        self._refixed = zrUtil.bind(self._refixed, self);
        
        self._setContent = zrUtil.bind(self.__setContent, self);
        
        this._tDom = this._tDom || document.createElement('div');
        var tDom = this._tDom;
        // 避免拖拽时页面选中的尴尬
        tDom.onselectstart = function() {
            return false;
        };
        tDom.onmouseover = function() {
            self._mousein = true;
        };
        tDom.onmouseout = function() {
            self._mousein = false;
        };
        tDom.className = 'echarts-tooltip';
        tDom.style.position = 'absolute';  // 不是多余的，别删！
        this._hasAppend = false;

        var axisLineShape = new LineShape({
            zlevel: this.getZlevelBase(),
            z: this.getZBase(),
            invisible: true,
            hoverable: false
        });
        shapeList.push(axisLineShape);
        zr.addShape(axisLineShape);
        this._axisLineShape = axisLineShape;

        var axisShadowShape = new LineShape({
            zlevel: this.getZlevelBase(),
            z: 1,                      // grid上，chart下
            invisible: true,
            hoverable: false
        });
        shapeList.push(axisShadowShape);
        zr.addShape(axisShadowShape);
        this._axisShadowShape = axisShadowShape;

        var axisCrossShape = new CrossShape({
            zlevel: this.getZlevelBase(),
            z: this.getZBase(),
            invisible: true,
            hoverable: false
        });
        shapeList.push(axisCrossShape);
        zr.addShape(axisCrossShape);
        this._axisCrossShape = axisCrossShape;
        
        this.showing = false;
        this.refresh(option);
    }
    
    Tooltip.prototype = {
        type: ecConfig.COMPONENT_TYPE_TOOLTIP,
        /**
         * 根据配置设置dom样式
         */
        _style: function (opt) {
            if (!opt) {
                return '';
            }
            var cssText = [];
            var transitionDuration = opt.transitionDuration;
            if (transitionDuration) {
                var transitionText = 'left ' + transitionDuration + 's,'
                                    + 'top ' + transitionDuration + 's';
                cssText.push(
                    'transition:' + transitionText
                );
                cssText.push(
                    '-moz-transition:' + transitionText
                );
                cssText.push(
                    '-webkit-transition:' + transitionText
                );
                cssText.push(
                    '-o-transition:' + transitionText
                );
            }

            if (opt.backgroundColor) {
                // for sb ie~
                cssText.push(
                    'background-Color:' + zrColor.toHex(
                        opt.backgroundColor
                    )
                );
                cssText.push('filter:alpha(opacity=70)');
                cssText.push('background-Color:' + opt.backgroundColor);
            }

            if (opt.borderWidth != null) {
                cssText.push('border-width:' + opt.borderWidth + 'px');
            }

            if (opt.borderColor != null) {
                cssText.push('border-color:' + opt.borderColor);
            }

            if (opt.borderRadius != null) {
                cssText.push(
                    'border-radius:' + opt.borderRadius + 'px'
                );
            }

            var textStyle = opt.textStyle;
            if (textStyle) {
                textStyle.color && cssText.push('color:' + textStyle.color);
                textStyle.decoration && cssText.push(
                    'text-decoration:' + textStyle.decoration
                );
                textStyle.align && cssText.push(
                    'text-align:' + textStyle.align
                );
                textStyle.fontFamily && cssText.push(
                    'font-family:' + textStyle.fontFamily
                );
                textStyle.fontSize && cssText.push(
                    'font-size:' + textStyle.fontSize + 'px'
                );
                textStyle.fontSize && cssText.push(
                    'line-height:' + Math.round(textStyle.fontSize*3/2) + 'px'
                );
                textStyle.fontStyle && cssText.push(
                    'font-style:' + textStyle.fontStyle
                );
                textStyle.fontWeight && cssText.push(
                    'font-weight:' + textStyle.fontWeight
                );
            }


            var padding = opt.padding;
            if (padding != null) {
                padding = this.reformCssArray(padding);
                cssText.push(
                    'padding:' + padding[0] + 'px '
                               + padding[1] + 'px '
                               + padding[2] + 'px '
                               + padding[3] + 'px'
                );
            }

            cssText = cssText.join(';') + ';';

            return cssText;
        },
        
        _hide: function () {
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            this._lastItemTriggerId = -1;
            
            var zr = this.zr;
            var axisLineShape = this._axisLineShape;
            var axisShadowShape = this._axisShadowShape;
            var axisCrossShape = this._axisCrossShape;
            var lastTipShape = this._lastTipShape;
            
            if (this._tDom) {
                this._tDom.style.display = 'none';
            }

            if (! axisLineShape.invisible) {
                axisLineShape.invisible = true;
                zr.modShape(axisLineShape);
            }
            if (! axisShadowShape.invisible) {
                axisShadowShape.invisible = true;
                zr.modShape(axisShadowShape);
            }
            if (! axisCrossShape.invisible) {
                axisCrossShape.invisible = true;
                zr.modShape(axisCrossShape);
            }
            if (lastTipShape && lastTipShape.tipShape.length > 0) {
                zr.delShape(lastTipShape.tipShape);
                this._lastTipShape = false;
                this.shapeList.length = 2;
            }
            this.showing = false;
        },

        _showTooltip: function (position, x, y, specialCssText) {
            var tDom = this._tDom;
            var domHeight = tDom.offsetHeight;
            var domWidth = tDom.offsetWidth;
            if (position) {
                if (typeof position === 'function') {
                    position = position([x, y]);
                }
                if (position instanceof Array) {
                    x = position[0];
                    y = position[1];
                }
            }
            if (x + domWidth > this._zrWidth) {
                // 太靠右
                //x = this._zrWidth - domWidth;
                x -= (domWidth + 40);
            }
            if (y + domHeight > this._zrHeight) {
                // 太靠下
                //y = this._zrHeight - domHeight;
                y -= (domHeight - 20);
            }
            if (y < 20) {
                y = 0;
            }
            tDom.style.cssText = gCssText
                                  + this._defaultCssText
                                  + (specialCssText ? specialCssText : '')
                                  + 'left:' + x + 'px;top:' + y + 'px;';
            
            if (domHeight < 10 || domWidth < 10) {
                // this._zrWidth - x < 100 || this._zrHeight - y < 100
                setTimeout(this._refixed, 20);
            }
            this.showing = true;
        },

        _refixed: function () {
            var tDom = this._tDom;
            if (tDom) {
                var cssText = '';
                var domHeight = tDom.offsetHeight;
                var domWidth = tDom.offsetWidth;
                var zrWidth = this._zrWidth;
                var zrHeight = this._zrHeight;
                if (tDom.offsetLeft + domWidth > zrWidth) {
                    cssText += 'left:' + (zrWidth - domWidth - 20) + 'px;';
                }
                if (tDom.offsetTop + domHeight > zrHeight) {
                    cssText += 'top:' + (zrHeight - domHeight - 10) + 'px;';
                }
                if (cssText !== '') {
                    tDom.style.cssText += cssText;
                }
            }
        },

        _tryShow: function () {
            var needShow;
            var trigger;
            var currentTarget = this._curTarget;
            var option = this.option;
            var grid = this.component.grid;
            if (!currentTarget) {
                // 坐标轴事件
                this._findAxisTrigger();
            }
            else {
                // 数据项事件
                if (currentTarget._type === 'island' && option.tooltip.show) {
                    this._showItemTrigger();
                    return;
                }
                var serie = ecData.get(currentTarget, 'series');
                var data = ecData.get(currentTarget, 'data');
                needShow = deepQuery(
                    [data, serie, option],
                    'tooltip.show'
                );
                if (serie == null || data == null || !needShow) {
                    // 不响应tooltip的数据对象延时隐藏
                    clearTimeout(this._hidingTicket);
                    clearTimeout(this._showingTicket);
                    this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                }
                else {
                    trigger = deepQuery(
                        [data, serie, option],
                        'tooltip.trigger'
                    );
                    if (trigger === 'axis') {
                        if (serie.coordinateSystem === 'cartesian') {
                            var cartesian = grid.getCartesian(
                                serie.xAxisIndex, serie.yAxisIndex
                            );
                            this._showCartesianAxisTrigger(cartesian);
                        }   
                    }
                    else {
                        this._showItemTrigger();
                    }
                }
            }
        },

        _findAxisTrigger: function () {
            
            var grid = this.component.grid;

            if (grid) {
                zrUtil.each(grid.getAllCartesians(), function (cartesian) {
                    this._showCartesianAxisTrigger(cartesian);
                }, this);
            }
        },

        /**
         * Show axis tooltip of cartesian tooltip
         * @param {module:echarts/coord/Carteisan} cartesian
         * @param {number} [dataIndex] Data index of category axis
         */
        _showCartesianAxisTrigger: function (cartesian, dataIndex) {

            ! this._event.connectTrigger && this.messageCenter.dispatch(
                ecConfig.EVENT.TOOLTIP_IN_GRID,
                this._event,
                null,
                this.myChart
            );

            var grid = this.component.grid;
            var tDom = this._tDom;
            var tooltipOption = this.option.tooltip;
            var formatter = tooltipOption.formatter;
            var position = tooltipOption.position;
            var showContent;
            var specialCssText = '';

            if (! tooltipOption.show) {
                return;
            }

            var event = this._event;
            var mouseX = zrEvent.getX(event);
            var mouseY = zrEvent.getY(event);

            var xAxis = cartesian.getAxis('x');
            var yAxis = cartesian.getAxis('y');

            var swapped = yAxis.isHorizontal();

            var dataX = xAxis.coordToData(swapped ? mouseY : mouseX, true);
            var dataY = yAxis.coordToData(swapped ? mouseX : mouseY, true);

            var params = [];
            
            var categoryAxis = cartesian.getAxesByScale('ordinal')[0];

            if (categoryAxis) {
                // Snapped tooltip because category axis is discrete
                mouseX = xAxis.dataToCoord(dataX);
                mouseY = yAxis.dataToCoord(dataY);
                if (swapped) {
                    var tmp = mouseX;
                    mouseX = mouseY;
                    mouseY = tmp;
                }

                if (dataIndex == null) {
                   dataIndex = categoryAxis === xAxis ? dataX : dataY;
                }

                zrUtil.each(cartesian.series, function (series) {
                    if (! this._isSelected(series.name)) {
                        return;
                    }
                    var seriesIndex = series.seriesIndex;
                    var dataItem = series.data[dataIndex];
                    var value;
                    var category = categoryAxis.scale.getItem(dataIndex);
                    // 有可能存在单个坐标轴的不同系列数据长度不一致的问题
                    if (dataItem) {
                        value = queryValue(dataItem);
                    }
                    // 寻找高亮元素
                    this.messageCenter.dispatch(
                        ecConfig.EVENT.TOOLTIP_HOVER,
                        this._event,
                        {
                            seriesIndex: seriesIndex,
                            dataIndex: dataIndex
                        },
                        this.myChart
                    );

                    params.push({
                        seriesIndex: seriesIndex,
                        seriesName: series.name,
                        series: series,
                        dataIndex: dataIndex,
                        data: dataItem,
                        name: category,
                        value: value,
                        // 向下兼容
                        0: series.name,
                        1: category,
                        2: value,
                        3: dataItem
                    });
                }, this);

                if (typeof formatter === 'function') {
                    var ticket = 'axis:' + dataIndex;
                    this._curTicket = ticket;
                    tDom.innerHTMl = formatter.call(
                        this.myChart, params, ticket, this._setContent
                    );
                }
                else {
                    this._curTicket = null;
                    if (! (typeof formatter === 'string')) {
                        // Default formatter
                        formatter = '{b}';
                        for (var i = 0; i < params.length; i++) {
                            formatter += '<br />{a' + i + '} : {c' + i + '}';
                        }
                    }
                    var seriesValues = zrUtil.map(params, function (item) {
                        var value = item.value;
                        if (! (value instanceof Array)) {
                            value = numAddCommas(value);
                        }
                        return [
                            encodeHTML(item.seriesName || ''),
                            encodeHTML(item.name || ''),
                            value
                        ];
                    });
                    tDom.innerHTML = stringFormatter(formatter, seriesValues);
                }

                // don't modify, just false, showContent == undefined == true
                if (showContent === false || !tooltipOption.showContent) {
                    // 只用tooltip的行为，不显示主体
                    return;
                }

                if (!this._hasAppend) {
                    tDom.style.left = this._zrWidth / 2 + 'px';
                    tDom.style.top = this._zrHeight / 2 + 'px';
                    this.dom.firstChild.appendChild(tDom);
                    this._hasAppend = true;
                }

                this._showTooltip(position, mouseX + 10, mouseY + 10, specialCssText);

                // TODO triggerAxis
                if (categoryAxis.isHorizontal()) {
                    this._styleAxisPointer(
                        cartesian.series,
                        mouseX, grid.getY(),
                        mouseX, grid.getYend(),
                        0, mouseX, mouseY
                    );
                }
                else {
                    this._styleAxisPointer(
                        cartesian.series,
                        grid.getX(), mouseY,
                        grid.getXend(), mouseY,
                        0, mouseX, mouseY
                    );
                }
            }
            else {
                // 双数值轴
                // TODO triggerAxis
                this._styleAxisPointer(
                    cartesian.series,
                    grid.getX(), mouseY,
                    grid.getXend(), mouseY,
                    0, mouseX, mouseY
                );
                
                if (dataIndex != null) {
                    this._showItemTrigger(true);
                }
                else {
                    clearTimeout(this._hidingTicket);
                    clearTimeout(this._showingTicket);
                    tDom.style.display = 'none';
                }
            }
        },

        /**
         * 极坐标 
         */
        _showPolarAxisTrigger: function (polarIndex, dataIndex) {
        },

        /**
         * @parma {boolean} axisTrigger 
         */
        _showItemTrigger: function (axisTrigger) {
            if (!this._curTarget) {
                return;
            }
            var grid = this.component.grid;
            var option = this.option;
            var tooltipOption = option.tooltip;
            var currentTarget = this._curTarget;
            var serie = ecData.get(currentTarget, 'series');
            var seriesIndex = ecData.get(currentTarget, 'seriesIndex');
            var data = ecData.get(currentTarget, 'data');
            var dataIndex = ecData.get(currentTarget, 'dataIndex');
            var name = ecData.get(currentTarget, 'name');
            var value = ecData.get(currentTarget, 'value');
            var special = ecData.get(currentTarget, 'special');
            var special2 = ecData.get(currentTarget, 'special2');
            var queryTarget = [data, serie, this.option];
            // 从低优先级往上找到trigger为item的formatter和样式
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            var tDom = this._tDom;
            
            var tooltipPrefix = 'tooltip.';

            if (currentTarget._type != 'island') {
                // 全局
                var trigger = axisTrigger ? 'axis' : 'item';
                if (tooltipOption.trigger === trigger) {
                    formatter = tooltipOption.formatter;
                    position = tooltipOption.position;
                }
                // 系列
                if (query(serie, tooltipPrefix + 'trigger') === trigger) {
                    showContent = query(serie, tooltipPrefix + 'showContent') || showContent;
                    formatter = query(serie, tooltipPrefix + 'formatter') || formatter;
                    position = query(serie, tooltipPrefix + 'position') || position;
                    specialCssText += this._style(query(serie, 'tooltip'));
                }
                // 数据项
                showContent = query(data, tooltipPrefix + 'showContent') || showContent;
                formatter = query(data, tooltipPrefix + 'formatter') || formatter;
                position = query(data, tooltipPrefix + 'position') || position;
                specialCssText += this._style(query(data, 'tooltip'));
            }
            else {
                this._lastItemTriggerId = NaN;
                showContent = deepQuery(queryTarget, tooltipPrefix + 'showContent');
                formatter = deepQuery(queryTarget, tooltipPrefix + 'islandFormatter');
                position = deepQuery(queryTarget, tooltipPrefix + 'islandPosition');
            }

            // 复位item trigger和axis trigger间短距离来回变换时的不响应
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;

            // 相同dataIndex seriesIndex时不再触发内容更新
            // 因为 mouseover 跟 mousemove 一样一直触发
            // FIXME
            if (this._lastItemTriggerId !== currentTarget.id) {
                this._lastItemTriggerId = currentTarget.id;
                
                var opt = {
                    seriesIndex: seriesIndex,
                    seriesName: serie.name || '',
                    series: serie,
                    dataIndex: dataIndex,
                    data: data,
                    name: name,
                    value: value,
                    percent: special,   // 饼图
                    indicator: special, // 雷达图
                    value2: special2,
                    indicator2: special2,
                    // 向下兼容
                    0: serie.name || '',
                    1: name,
                    2: value,
                    3: special,
                    4: special2,
                    5: data,
                    6: seriesIndex,
                    7: dataIndex
                };
                
                if (typeof formatter === 'function') {
                    var ticket = (serie.name || '') + ':' + dataIndex;
                    this._curTicket = ticket;
                    tDom.innerHTMl = formatter.call(this.myChart, opt, ticket, this._setContent);
                }
                else {
                    this._curTicket = null;
                    if (typeof formatter === 'string') {
                        tDom.innerHTML = stringFormatter(formatter, [[
                            // a
                            encodeHTML(serie.name),
                            // b
                            encodeHTML(name),
                            // c
                            value instanceof Array ? value : numAddCommas(value),
                            // d
                            special || '',
                            // e
                            ecData.get(currentTarget, 'special2') || ''
                        ]]);
                    }
                    else {
                        this._curTicket = NaN;
                        var itemFormatter = this._itemFormatter;
                        if (serie.type === ecConfig.CHART_TYPE_RADAR && special) {
                            tDom.innerHTML = itemFormatter.radar.call(
                                this, serie, name, value, special
                            );
                        }
                        else if (serie.type === ecConfig.CHART_TYPE_EVENTRIVER) {
                            tDom.innerHTML = itemFormatter.eventRiver.call(
                                this, serie, name, value, data
                            );
                        }
                        else {
                            tDom.innerHTML = ''
                                + (serie.name != null ? (encodeHTML(serie.name) + '<br/>') : '')
                                + (name === '' ? '' : (encodeHTML(name) + ' : '))
                                + (value instanceof Array ? value : numAddCommas(value));
                        }
                    }
                    
                }
            }

            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            if (deepQuery(queryTarget, tooltipPrefix + 'axisPointer.show') && grid) {
                this._styleAxisPointer(
                    [serie],
                    grid.getX(), y, 
                    grid.getXend(), y,
                    0, x, y
                );
            }
            else {
                this._hide();
            }

            // don't modify, just false, showContent == undefined == true
            if (showContent === false || ! tooltipOption.showContent) {
                // 只用tooltip的行为，不显示主体
                return;
            }
            
            if (!this._hasAppend) {
                tDom.style.left = this._zrWidth / 2 + 'px';
                tDom.style.top = this._zrHeight / 2 + 'px';
                this.dom.firstChild.appendChild(tDom);
                this._hasAppend = true;
            }

            this._showTooltip(position, x + 20, y - 20, specialCssText);
        },

        _itemFormatter: {
            radar: function(serie, name, value, indicator){
                var html = '';
                html += encodeHTML(name === '' ? (serie.name || '') : name);
                html += html === '' ? '' : '<br />';
                for (var i = 0 ; i < indicator.length; i ++) {
                    html += encodeHTML(indicator[i].text) + ' : ' 
                            + numAddCommas(value[i]) + '<br />';
                }
                return html;
            },
            chord: function(serie, name, value, special, special2) {
                if (special2 == null) {
                    // 外环上
                    return encodeHTML(name) + ' (' + numAddCommas(value) + ')';
                }
                else {
                    var name1 = encodeHTML(name);
                    var name2 = encodeHTML(special);
                    // 内部弦上
                    return ''
                        + (serie.name != null ? (encodeHTML(serie.name) + '<br/>') : '')
                        + name1 + ' -> ' + name2 
                        + ' (' + numAddCommas(value) + ')'
                        + '<br />'
                        + name2 + ' -> ' + name1
                        + ' (' + numAddCommas(special2) + ')';
                }
            },
            eventRiver: function(serie, name, value, data) {
                var html = '';
                html += encodeHTML(serie.name === '' ? '' : (serie.name + ' : ') );
                html += encodeHTML(name);
                html += html === '' ? '' : '<br />';
                data = data.evolution;
                for (var i = 0, l = data.length; i < l; i++) {
                    html += '<div style="padding-top:5px;">';
                    if (!data[i].detail) {
                        continue;
                    }
                    if (data[i].detail.img) {
                        html += '<img src="' + data[i].detail.img 
                                + '" style="float:left;width:40px;height:40px;">';
                    }
                    html += '<div style="margin-left:45px;">' + data[i].time + '<br/>';
                    html += '<a href="' + data[i].detail.link + '" target="_blank">';
                    html += data[i].detail.text + '</a></div>';
                    html += '</div>';
                }
                return html;
            }
        },

        /**
         * 设置坐标轴指示器样式 
         */
        _styleAxisPointer: function (seriesArray, xStart, yStart, xEnd, yEnd, gap, x, y) {
            if (seriesArray.length > 0) {
                var queryTarget;
                var curType;
                var axisPointer = this.option.tooltip.axisPointer;
                var pointType = axisPointer.type;
                var zr = this.zr;
                var subPixelOptimize = this.subPixelOptimize;
                var grid = this.component.grid;
                var style = {
                    line: {},
                    cross: {},
                    shadow: {}
                };
                for (var pType in style) {
                    var key = pType + 'Style';
                    style[pType].color = axisPointer[key].color;
                    style[pType].width = axisPointer[key].width;
                    style[pType].type = axisPointer[key].type;
                }
                for (var i = 0, l = seriesArray.length; i < l; i++) {
                    queryTarget = seriesArray[i];
                    curType = query(queryTarget, 'tooltip.axisPointer.type');
                    pointType = curType || pointType; 
                    if (curType) {
                        var prefix = 'tooltip.axisPointer.' + curType + 'Style.';
                        var styleCurType = style[curType];
                        styleCurType.color = query(queryTarget, prefix + 'color') || styleCurType.color;
                        styleCurType.width = query(queryTarget, prefix + 'width') || styleCurType.width;
                        styleCurType.type = query(queryTarget, prefix + 'type') || styleCurType.type;
                    }
                }

                if (pointType === 'line') {
                    var axisLineShape = this._axisLineShape;
                    var lineWidth = style.line.width;
                    var isVertical = xStart == xEnd;
                    axisLineShape.style = {
                        xStart: isVertical ? subPixelOptimize(xStart, lineWidth) : xStart,
                        yStart: isVertical ? yStart : subPixelOptimize(yStart, lineWidth),
                        xEnd: isVertical ? subPixelOptimize(xEnd, lineWidth) : xEnd,
                        yEnd: isVertical ? yEnd : subPixelOptimize(yEnd, lineWidth),
                        strokeColor: style.line.color,
                        lineWidth: lineWidth,
                        lineType: style.line.type
                    };
                    axisLineShape.invisible = false;
                    zr.modShape(axisLineShape);
                }
                else if (pointType === 'cross') {
                    // TODO 只支持 0，0 坐标系
                    var axisCrossShape = this._axisCrossShape;
                    var axisCrossShapeStyle = axisCrossShape.style;
                    var crossWidth = style.cross.width;
                    var textAlign;
                    var textBaseline;
                    var textX = 0;
                    var textY = 0;
                    var cartesian = grid.getCartesian(0, 0);
                    axisCrossShape.style = {
                        brushType: 'stroke',
                        rect: grid.getArea(),
                        x: subPixelOptimize(x, crossWidth),
                        y: subPixelOptimize(y, crossWidth),
                        text: ('( ' 
                               + cartesian.getAxis('x').coordToData(x)
                               + ' , '
                               + cartesian.getAxis('y').coordToData(y) 
                               + ' )'
                              ).replace('  , ', ' ').replace(' ,  ', ' '),
                        textPosition: 'specific',
                        strokeColor: style.cross.color,
                        lineWidth: crossWidth,
                        lineType: style.cross.type
                    };
                    if (grid.getXend() - x > 100) {          // 右侧有空间
                        textAlign = 'left';
                        textX = x + 10;
                    }
                    else {
                        textAlign = 'right';
                        textX = x - 10;
                    }
                    if (y - grid.getY() > 50) {             // 上方有空间
                        textBaseline = 'bottom';
                        textY = y - 10;
                    }
                    else {
                        textBaseline = 'top';
                        textY = y + 10;
                    }
                    axisCrossShapeStyle.textBaseline = textBaseline;
                    axisCrossShapeStyle.textAlign = textAlign;
                    axisCrossShapeStyle.textX = textX;
                    axisCrossShapeStyle.textY = textY;

                    axisCrossShape.invisible = false;
                    zr.modShape(axisCrossShape);
                }
                else if (pointType === 'shadow') {
                    var axisShadowShape = this._axisShadowShape;
                    var shadowWidth = style.shadow.width;
                    if (shadowWidth == null  || shadowWidth === 'auto' || isNaN(shadowWidth)) {
                        shadowWidth = gap;
                    }
                    if (xStart === xEnd) {
                        // 纵向
                        if (Math.abs(grid.getX() - xStart) < 2) {
                            // 最左边
                            shadowWidth /= 2;
                            xStart = xEnd = xEnd + shadowWidth / 2;
                        }
                        else if (Math.abs(grid.getXend() - xStart) < 2) {
                            // 最右边
                            shadowWidth /= 2;
                            xStart = xEnd = xEnd - shadowWidth / 2;
                        }
                    }
                    else if (yStart === yEnd) {
                        // 横向
                        if (Math.abs(grid.getY() - yStart) < 2) {
                            // 最上边
                            shadowWidth /= 2;
                            yStart = yEnd = yEnd + shadowWidth / 2;
                        }
                        else if (Math.abs(grid.getYend() - yStart) < 2) {
                            // 最右边
                            shadowWidth /= 2;
                            yStart = yEnd = yEnd - shadowWidth / 2;
                        }
                    }
                    axisShadowShape.style = {
                        xStart: xStart,
                        yStart: yStart,
                        xEnd: xEnd,
                        yEnd: yEnd,
                        strokeColor: style.shadow.color,
                        lineWidth: shadowWidth
                    };
                    axisShadowShape.invisible = false;
                    zr.modShape(axisShadowShape);
                }
            }
        },

        _onmousemove: function (param) {
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            if (this._mousein && this._enterable) {
                return;
            }
            var grid = this.component.grid;
            var target = param.target;
            var event = param.event;
            var mx = zrEvent.getX(event);
            var my = zrEvent.getY(event);
            var hasAxisTrigger = this._hasAxisTrigger;
            this._event = event;
            event.zrenderX = mx;
            event.zrenderY = my;
            if (! target) {
                this._curTarget = null;
                // 判断是否落到直角系里，axis触发的tooltip
                if (hasAxisTrigger && grid 
                    && zrArea.isInside(rectangleInstance, grid.getRect(), mx, my)
                ) {
                    this._showingTicket = setTimeout(this._tryShow, this._showDelay);
                }
                else if (hasAxisTrigger 
                        && this.component.polar
                ) {
                    // TODO Polar axis
                }
                else {
                    !event.connectTrigger && this.messageCenter.dispatch(
                        ecConfig.EVENT.TOOLTIP_OUT_GRID,
                        event, null, this.myChart
                    );
                    this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                }
            }
            else {
                this._curTarget = target;
                if (hasAxisTrigger 
                    && this.component.polar
                ) {
                    // TODO polar axis
                }
                this._showingTicket = setTimeout(this._tryShow, this._showDelay);
            }
        },

        /**
         * zrender事件响应：鼠标离开绘图区域
         */
        _onglobalout: function () {
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            this._hidingTicket = setTimeout(this._hide, this._hideDelay);
        },

        /**
         * 异步回调填充内容
         */
        __setContent: function (ticket, content) {
            if (!this._tDom) {
                return;
            }
            if (ticket === this._curTicket) {
                this._tDom.innerHTML = content;
            }
            
            setTimeout(this._refixed, 20);
        },

        ontooltipHover: function (param, tipShape) {
            var lastTipShape = this._lastTipShape;
            if (!lastTipShape // 不存在或者存在但dataIndex发生变化才需要重绘
                || (lastTipShape && lastTipShape.dataIndex != param.dataIndex)
            ) {
                if (lastTipShape && lastTipShape.tipShape.length > 0) {
                    this.zr.delShape(lastTipShape.tipShape);
                    this.shapeList.length = 2;
                }
                for (var i = 0, l = tipShape.length; i < l; i++) {
                    tipShape[i].zlevel = this.getZlevelBase();
                    tipShape[i].z = this.getZBase();
                    
                    tipShape[i].style = zrShapeBase.prototype.getHighlightStyle(
                        tipShape[i].style,
                        tipShape[i].highlightStyle
                    );
                    tipShape[i].draggable = false;
                    tipShape[i].hoverable = false;
                    tipShape[i].clickable = false;
                    tipShape[i].ondragend = null;
                    tipShape[i].ondragover = null;
                    tipShape[i].ondrop = null;
                    this.shapeList.push(tipShape[i]);
                    this.zr.addShape(tipShape[i]);
                }
                this._lastTipShape = {
                    dataIndex: param.dataIndex,
                    tipShape: tipShape
                };
            }
        },

        ondragend: function () {
            this._hide();
        },

        /**
         * 图例选择
         */
        onlegendSelected: function (param) {
            this._selectedMap = param.selected;
        },

        _setSelectedMap: function () {
            var legend = this.legend;
            if (legend) {
                this._selectedMap = zrUtil.clone(legend.getSelectedMap());
            }
            else {
                this._selectedMap = {};
            }
        },

        _isSelected: function (itemName) {
            var selectedMap = this._selectedMap;
            if (selectedMap[itemName] != null) {
                return selectedMap[itemName];
            }
            else {
                return true; // 没在legend里定义的都为true啊~
            }
        },

        /**
         * 模拟tooltip hover方法
         * {object} params  参数
         *          {seriesIndex: 0, seriesName:'', dataInex:0} line、bar、scatter、k、radar
         *          {seriesIndex: 0, seriesName:'', name:''} map、pie、chord
         * TODO
         */
        showTip: function (params) {
            if (!params) {
                return;
            }
            
            var seriesIndex;
            var series = this.option.series;
            if (params.seriesIndex != null) {
                seriesIndex = params.seriesIndex;
            }
            else {
                var seriesName = params.seriesName;
                for (var i = 0, l = series.length; i < l; i++) {
                    if (series[i].name === seriesName) {
                        seriesIndex = i;
                        break;
                    }
                }
            }
            
            var serie = series[seriesIndex];
            if (serie == null) {
                return;
            }
            var chart = this.myChart.chart[serie.type];
            var isAxisTrigger = this.deepQuery(
                                    [serie, this.option], 'tooltip.trigger'
                                ) === 'axis';
            
            if (!chart) {
                return;
            }
            
            if (isAxisTrigger) {
                // axis trigger
                var dataIndex = params.dataIndex;
                switch (chart.type) {
                    case ecConfig.CHART_TYPE_LINE :
                    case ecConfig.CHART_TYPE_BAR :
                    case ecConfig.CHART_TYPE_K :
                    case ecConfig.CHART_TYPE_RADAR :
                        if (this.component.polar == null 
                            || serie.data[0].value.length <= dataIndex
                        ) {
                            return;
                        }
                        var polarIndex = serie.polarIndex || 0;
                        var vector = this.component.polar.getVector(
                            polarIndex, dataIndex, 'max'
                        );
                        this._event = {
                            zrenderX: vector[0],
                            zrenderY: vector[1]
                        };
                        this._showPolarTrigger(
                            polarIndex, 
                            dataIndex
                        );
                        break;
                }
            }
            else {
                // item trigger
                var shapeList = chart.shapeList;
                var x;
                var y;
                switch (chart.type) {
                    case ecConfig.CHART_TYPE_LINE :
                    case ecConfig.CHART_TYPE_BAR :
                    case ecConfig.CHART_TYPE_K :
                    case ecConfig.CHART_TYPE_TREEMAP :
                    case ecConfig.CHART_TYPE_SCATTER :
                        var dataIndex = params.dataIndex;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i]._mark == null
                                && ecData.get(shapeList[i], 'seriesIndex') == seriesIndex
                                && ecData.get(shapeList[i], 'dataIndex') == dataIndex
                            ) {
                                this._curTarget = shapeList[i];
                                x = shapeList[i].style.x;
                                y = chart.type != ecConfig.CHART_TYPE_K 
                                    ? shapeList[i].style.y : shapeList[i].style.y[0];
                                break;
                            }
                        }
                        break;
                    case ecConfig.CHART_TYPE_RADAR :
                        var dataIndex = params.dataIndex;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i].type === 'polygon'
                                && ecData.get(shapeList[i], 'seriesIndex') == seriesIndex
                                && ecData.get(shapeList[i], 'dataIndex') == dataIndex
                            ) {
                                this._curTarget = shapeList[i];
                                var vector = this.component.polar.getCenter(
                                    serie.polarIndex || 0
                                );
                                x = vector[0];
                                y = vector[1];
                                break;
                            }
                        }
                        break;
                    case ecConfig.CHART_TYPE_PIE :
                        var name = params.name;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i].type === 'sector'
                                && ecData.get(shapeList[i], 'seriesIndex') == seriesIndex
                                && ecData.get(shapeList[i], 'name') == name
                            ) {
                                this._curTarget = shapeList[i];
                                var style = this._curTarget.style;
                                var midAngle = (style.startAngle + style.endAngle) 
                                                / 2 * Math.PI / 180;
                                x = this._curTarget.style.x + Math.cos(midAngle) * style.r / 1.5;
                                y = this._curTarget.style.y - Math.sin(midAngle) * style.r / 1.5;
                                break;
                            }
                        }
                        break;
                    case ecConfig.CHART_TYPE_MAP :
                        var name = params.name;
                        var mapType = serie.mapType;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i].type === 'text'
                                && shapeList[i]._mapType === mapType
                                && shapeList[i].style._name === name
                            ) {
                                this._curTarget = shapeList[i];
                                x = this._curTarget.style.x + this._curTarget.position[0];
                                y = this._curTarget.style.y + this._curTarget.position[1];
                                break;
                            }
                        }
                        break;
                    case ecConfig.CHART_TYPE_CHORD:
                        var name = params.name;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i].type === 'sector'
                                && ecData.get(shapeList[i], 'name') == name
                            ) {
                                this._curTarget = shapeList[i];
                                var style = this._curTarget.style;
                                var midAngle = (style.startAngle + style.endAngle) 
                                                / 2 * Math.PI / 180;
                                x = this._curTarget.style.x + Math.cos(midAngle) * (style.r - 2);
                                y = this._curTarget.style.y - Math.sin(midAngle) * (style.r - 2);
                                this.zr.trigger(
                                    zrConfig.EVENT.MOUSEMOVE,
                                    {
                                        zrenderX: x,
                                        zrenderY: y
                                    }
                                );
                                return;
                            }
                        }
                        break;
                    case ecConfig.CHART_TYPE_FORCE:
                        var name = params.name;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i].type === 'circle'
                                && ecData.get(shapeList[i], 'name') == name
                            ) {
                                this._curTarget = shapeList[i];
                                x = this._curTarget.position[0];
                                y = this._curTarget.position[1];
                                break;
                            }
                        }
                        break;
                }
                if (x != null && y != null) {
                    this._event = {
                        zrenderX: x,
                        zrenderY: y
                    };
                    this.zr.addHoverShape(this._curTarget);
                    this.zr.refreshHover();
                    this._showItemTrigger();
                }
            }
        },
        
        /**
         * 关闭，公开接口 
         */
        hideTip: function () {
            this._hide();
        },

        /**
         * 刷新
         */
        refresh: function (newOption) {
            // this._selectedMap;
            // this._defaultCssText;    // css样式缓存
            // this._hasAxisTrigger;   // 坐标轴触发
            // this._curTarget;
            // this._event;
            // this._curTicket;         // 异步回调标识，用来区分多个请求
            
            // 缓存一些高宽数据
            var zr = this.zr;
            var lastTipShape = this._lastTipShape;

            this._zrHeight = zr.getHeight();
            this._zrWidth = zr.getWidth();
            
            if (lastTipShape && lastTipShape.tipShape.length > 0) {
                zr.delShape(lastTipShape.tipShape);
            }
            this._lastTipShape = null;
            this.shapeList.length = 2;
            
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            this._lastItemTriggerId = -1;
            
            if (newOption) {
                this.option = newOption;
                this.option.tooltip = this.reformOption(this.option.tooltip);

                var option = this.option;
                var tooltipOption = option.tooltip;
                
                tooltipOption.textStyle = zrUtil.merge(
                    tooltipOption.textStyle,
                    this.ecTheme.textStyle
                );
                this._hasAxisTrigger = false;
                if (tooltipOption.trigger === 'axis') {
                    this._hasAxisTrigger = true;
                }

                var series = this.option.series;
                for (var i = 0, l = series.length; i < l; i++) {
                    if (query(series[i], 'tooltip.trigger') === 'axis') {
                        this._hasAxisTrigger = true;
                        break;
                    }
                }
                // this._hidingTicket;
                // this._showingTicket;
                this._showDelay = tooltipOption.showDelay; // 显示延迟
                this._hideDelay = tooltipOption.hideDelay; // 隐藏延迟
                this._defaultCssText = this._style(tooltipOption);
                
                this._setSelectedMap();
                this._axisLineWidth = tooltipOption.axisPointer.lineStyle.width;
                this._enterable = tooltipOption.enterable;
            }
            if (this.showing) {
                var self = this;
                setTimeout(function(){
                    self.zr.trigger(zrConfig.EVENT.MOUSEMOVE, self.zr.handler._event);
                },50);
            }
        },

        /**
         * 释放后实例不可用，重载基类方法
         */
        onbeforDispose: function () {
            var lastTipShape = this._lastTipShape;
            var zr = this.zr;
            if (lastTipShape && lastTipShape.tipShape.length > 0) {
                zr.delShape(lastTipShape.tipShape);
            }
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            zr.un(zrConfig.EVENT.MOUSEMOVE, this._onmousemove);
            zr.un(zrConfig.EVENT.GLOBALOUT, this._onglobalout);
            
            if (this._hasAppend && !!this.dom.firstChild) {
                this.dom.firstChild.removeChild(this._tDom);
            }
            this._tDom = null;
        }
    };

    zrUtil.inherits(Tooltip, Base);

    require('../component').define('tooltip', Tooltip);

    return Tooltip;
});
