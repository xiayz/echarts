/**
 * Axis component provide xAxis and yAxis draw
 *
 * @desc echarts基于Canvas，纯Javascript图表库，提供直观，生动，可交互，可个性化定制的数据统计图表。
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         Yi Shen (https://github.com/pissang)
 *
 * 直角坐标系中坐标轴数组，数组中每一项代表一条横轴（纵轴）坐标轴。
 * 标准（1.0）中规定最多同时存在2条横轴和2条纵轴
 *    单条横轴时可指定安放于grid的底部（默认）或顶部，2条同时存在时则默认第一条安放于底部，第二天安放于顶部
 *    单条纵轴时可指定安放于grid的左侧（默认）或右侧，2条同时存在时则默认第一条安放于左侧，第二天安放于右侧。
 * 坐标轴有两种类型，类目型和数值型（区别详见axis）：
 *    横轴通常为类目型，但条形图时则横轴为数值型，散点图时则横纵均为数值型
 *    纵轴通常为数值型，但条形图时则纵轴为类目型。
 * 
 * TODO 
 * - Time formattter
 * - Label rotation
 * - Label clickable and hightlight color
 * - Category interval
 * - boundaryGap
 * - min, max, splitNumber
 * 
 * - axisLine add halfLineWidth offset ?
 */
define(function (require) {
    var Base = require('./base');

    var LineShape = require('zrender/shape/Line');
    var TextShape = require('zrender/shape/Text');
    var RectShape = require('zrender/shape/Rectangle');

    var ecConfig = require('../config');
    var ecData = require('../util/ecData');
    var number = require('../util/number');

    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');

    var component = require('../component');

    var round = Math.round;
    /**************************************
     * 坐标轴配置项，分为数值型和类目型
     **************************************/
    // 数值型坐标轴默认参数
    ecConfig.valueAxis = {
        zlevel: 0,                  // 一级层叠
        z: 0,                       // 二级层叠
        show: true,
        position: 'left',      // 位置
        name: '',              // 坐标轴名字，默认为空
        nameLocation: 'end',   // 坐标轴名字位置，支持'start' | 'end'
        nameTextStyle: {},     // 坐标轴文字样式，默认取全局样式
        boundaryGap: [0, 0],   // 数值起始和结束两端空白策略
        // min: null,          // 最小值
        // max: null,          // 最大值
        // scale: false,       // 脱离0值比例，放大聚焦到最终_min，_max区间
        // splitNumber: 5,        // 分割段数，默认为5
        axisLine: {            // 坐标轴线
            show: true,        // 默认显示，属性show控制显示与否
            onZero: true,
            lineStyle: {       // 属性lineStyle控制线条样式
                color: '#48b',
                width: 2,
                type: 'solid'
            }
        },
        axisTick: {            // 坐标轴小标记
            show: true,       // 属性show控制显示与否，默认显示
            inside: false,     // 控制小标记是否在grid里
            length :5,         // 属性length控制线长
            lineStyle: {       // 属性lineStyle控制线条样式
                color: '#333',
                width: 1
            }
        },
        axisLabel: {           // 坐标轴文本标签，详见axis.axisLabel
            show: true,
            rotate: 0,
            margin: 8,
            // clickable: false,
            // formatter: null,
            textStyle: {       // 其余属性默认使用全局文本样式，详见TEXTSTYLE
                color: '#333'
            }
        },
        splitLine: {           // 分隔线
            show: true,        // 默认显示，属性show控制显示与否
            lineStyle: {       // 属性lineStyle（详见lineStyle）控制线条样式
                color: ['#ccc'],
                width: 1,
                type: 'solid'
            }
        },
        splitArea: {           // 分隔区域
            show: false,       // 默认不显示，属性show控制显示与否
            areaStyle: {       // 属性areaStyle（详见areaStyle）控制区域样式
                color: ['rgba(250,250,250,0.3)','rgba(200,200,200,0.3)']
            }
        }
    };

    // 类目轴
    ecConfig.categoryAxis =  {
        zlevel: 0,                  // 一级层叠
        z: 0,                       // 二级层叠
        show: true,
        position: 'bottom',    // 位置
        name: '',              // 坐标轴名字，默认为空
        nameLocation: 'end',   // 坐标轴名字位置，支持'start' | 'end'
        nameTextStyle: {},     // 坐标轴文字样式，默认取全局样式
        boundaryGap: true,     // 类目起始和结束两端空白策略
        axisLine: {            // 坐标轴线
            show: true,        // 默认显示，属性show控制显示与否
            onZero: true,
            lineStyle: {       // 属性lineStyle控制线条样式
                color: '#48b',
                width: 2,
                type: 'solid'
            }
        },
        axisTick: {            // 坐标轴小标记
            show: true,        // 属性show控制显示与否，默认不显示
            interval: 'auto',
            inside: false,    // 控制小标记是否在grid里 
            // onGap: null,
            length :5,         // 属性length控制线长
            lineStyle: {       // 属性lineStyle控制线条样式
                color: '#333',
                width: 1
            }
        },
        axisLabel: {           // 坐标轴文本标签，详见axis.axisLabel
            show: true,
            interval: 'auto',
            rotate: 0,
            margin: 8,
            // clickable: false,
            // formatter: null,
            textStyle: {       // 其余属性默认使用全局文本样式，详见TEXTSTYLE
                color: '#333'
            }
        },
        splitLine: {           // 分隔线
            show: true,        // 默认显示，属性show控制显示与否
            // onGap: null,
            lineStyle: {       // 属性lineStyle（详见lineStyle）控制线条样式
                color: ['#ccc'],
                width: 1,
                type: 'solid'
            }
        },
        splitArea: {           // 分隔区域
            show: false,       // 默认不显示，属性show控制显示与否
            // onGap: null,
            areaStyle: {       // 属性areaStyle（详见areaStyle）控制区域样式
                color: ['rgba(250,250,250,0.3)','rgba(200,200,200,0.3)']
            }
        }
    };

    /**
     * 构造函数
     * @param {Object} messageCenter echart消息中心
     * @param {ZRender} zr zrender实例
     * @param {Object} option 图表选项
     *     @param {string=} option.xAxis.type 坐标轴类型，横轴默认为类目型'category'
     *     @param {string=} option.yAxis.type 坐标轴类型，纵轴默认为类目型'value'
     * @param {Object} component 组件
     */
    function Axis(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);

        this.refresh(option);
    }

    Axis.prototype = {

        type: ecConfig.COMPONENT_TYPE_AXIS,

        refresh: function (newOption) {
            this.clear();

            if (newOption) {
                this.option = newOption;
            }
            var option = this.option;

            var grid = this.component.grid;

            var axisType = this.type;
            var axisTypeShort = axisType.slice(0, 1);
            var axesOption = option[axisType];

            if (! (axesOption instanceof Array)) {
                axesOption = [axesOption];
            }

            for (var i = 0; i < axesOption.length; i++) {
                var axisOption = axesOption[i];
                // Reform option
                if (! axisOption.type) {
                    // Default x is category axis and y is value axis
                    axisOption.type = axisTypeShort === 'x'
                        ? 'category' : 'value';
                }
                var key = axisOption.type + 'Axis';
                axesOption[i] = zrUtil.merge(
                    zrUtil.merge(
                        axisOption,
                        this.ecTheme[key] || {}
                    ),
                    ecConfig[key]
                );

                var axis = grid.getAxis(axisTypeShort, i);
                this._buildShape(axis, axisOption);
            }
        },

        _buildShape: function (axis, option) {

            var shapeList = this.shapeList;

            option.axisLine.show && this._buildAxisLine(axis, option);
            option.axisTick.show && this._buildAxisTick(axis, option);
            option.axisLabel.show && this._buildAxisLabel(axis, option);

            this._buildSplitLineArea(axis, option);

            for (var i = 0, l = shapeList.length; i < l; i++) {
                this.zr.addShape(shapeList[i]);
            }
        },

        // 轴线
        _buildAxisLine: function (axis, option) {
            var lineStyleOption = option.axisLine.lineStyle;
            var lineWidth = lineStyleOption.width;
            var grid = this.component.grid;

            var axShape = new LineShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase() + 3,
                hoverable: false,

                style: {
                    lineCap: 'round',
                    lineWidth: lineWidth,
                    lineType: lineStyleOption.type,
                    strokeColor: lineStyleOption.color,
                }
            });

            var xStart;
            var yStart;
            var xEnd;
            var yEnd;

            var x0 = grid.getX();
            var y0 = grid.getY();
            var x1 = grid.getXend();
            var y1 = grid.getYend();

            // Sub pixel optimize
            var offset = (round(lineWidth) % 2) / 2;
            var otherCoord = axis.otherCoord + offset;
            switch (axis.position) {
                case 'left':
                    xStart = xEnd = otherCoord;
                    yStart = y1;
                    yEnd = y0;
                    break;
                case 'right':
                    xStart = xEnd = otherCoord;
                    yStart = y1;
                    yEnd = y0;
                    break;
                case 'bottom':
                    xStart = x0;
                    xEnd = x1;
                    yStart = yEnd = otherCoord;
                    break;
                case 'top':
                    xStart = x0;
                    xEnd = x1;
                    yStart = yEnd = otherCoord;
                    break;
            }
            var style = axShape.style;
            var nameTextStyleOption = option.nameTextStyle;
            style.xStart = xStart;
            style.yStart = yStart;
            style.xEnd = xEnd;
            style.yEnd = yEnd;
            if (option.name !== '') { // 别帮我代码规范
                style.text = option.name;
                style.textPosition = option.nameLocation;
                style.textFont = this.getFont(nameTextStyleOption);
                if (nameTextStyleOption.align) {
                    style.textAlign = nameTextStyleOption.align;
                }
                if (nameTextStyleOption.baseline) {
                    style.textBaseline = nameTextStyleOption.baseline;
                }
                if (nameTextStyleOption.color) {
                    style.textColor = nameTextStyleOption.color;
                }
            }

            this.shapeList.push(axShape);
        },

        _buildAxisTick: function (axis, option) {
            var tickOption = option.axisTick;

            var lineStyleOption = tickOption.lineStyle;
            var tickLen = tickOption.length;
            var tickColor = lineStyleOption.color;
            var tickLineWidth = lineStyleOption.width;

            // Sub pixel optimize
            var offset = round(tickLineWidth) % 2 / 2;

            var axisPosition = axis.position;

            var ticksCoords = axis.getTicksCoords();

            for (var i = 0; i < ticksCoords.length; i++) {
                var tickCoord = ticksCoords[i] + offset;

                var x;
                var y;
                var offX = 0;
                var offY = 0;

                if (axis.isHorizontal()) {
                    x = tickCoord;
                    y = axis.otherCoord;
                    offY = axisPosition === 'top' ? -tickLen : tickLen;
                }
                else {
                    x = axis.otherCoord;
                    y = tickCoord;
                    offX = axisPosition === 'left' ? -tickLen : tickLen;
                }
                if (tickOption.inside) {
                    offX = -offX;
                    offY = -offY;
                }
                // Tick line
                var shape = new LineShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        xStart: x,
                        yStart: y,
                        xEnd: x + offX,
                        yEnd: y + offY,
                        strokeColor: tickColor,
                        lineWidth: tickLineWidth
                    }
                });

                this.shapeList.push(shape);
            }
        },

        _buildAxisLabel: function (axis, option) {
            var labelOption = option.axisLabel;
            var textStyle = labelOption.textStyle;

            var labelRotate = labelOption.rotate;

            var formatter = labelOption.formatter;
            if (! formatter) {
                // Default formatter
                switch (option.type) {
                    // TODO
                    case 'log':
                        break;
                    case 'category':
                        formatter = function (val) {return val;};
                        break;
                    default:
                        formatter = this.numAddCommas;
                }
            }
            else if (typeof formatter === 'string') {
                formatter = (function (tpl) {
                    return function (val) {
                        return tpl.replace('{value}', val);
                    }
                })(formatter);
            }

            var ticks = axis.scale.getTicks();
            var labelMargin = labelOption.margin;
            var grid = this.component.grid;

            for (var i = 0; i < ticks.length; i++) {
                var tick = ticks[i];
                var tickCoord = axis.dataToCoord(tick);

                var label = tick;
                if (option.type === 'category') {
                    label = option.data[tick];    
                }
                else if (option.type === 'time') {
                    // TODO
                }

                var text = formatter(label);

                var labelTextAlign = 'center';
                var labelTextBaseline = 'middle';
                var x;
                var y;
                switch (axis.position) {
                    case 'top':
                        y = grid.getY() - labelMargin;
                        x = tickCoord;
                        labelTextBaseline = 'bottom';
                        break;
                    case 'bottom':
                        x = tickCoord;
                        y = grid.getYend() + labelMargin;
                        labelTextBaseline = 'top';
                        break;
                    case 'left':
                        x = grid.getX() - labelMargin;
                        y = tickCoord;
                        labelTextAlign = 'right';
                        break;
                    case 'right':
                        x = grid.getXend() + labelMargin;
                        y = tickCoord;
                        labelTextAlign = 'left';
                        break;
                }
                if (axis.isHorizontal()) {
                    if (labelRotate) {
                        labelTextAlign = labelRotate > 0 ? 'left' : 'right';
                    }
                }

                var shape = new TextShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: 0,
                        y: 0,

                        text: text,
                        textFont: this.getFont(textStyle),
                        textAlign: labelTextAlign,
                        textBaseline: labelTextBaseline
                    },
                    position: [x, y],
                    rotation: [labelRotate * Math.PI / 180, 0, 0]
                });

                this.shapeList.push(shape);
            }
        },

        _buildSplitLineArea: function (axis, option) {
            var grid = this.component.grid;

            var splitLineOption = option.splitLine;
            var splitLineStyleOption = splitLineOption.lineStyle;
            var lineWidth = splitLineStyleOption.width;
            var lineColor = splitLineStyleOption.color;

            var splitAreaOption = option.splitArea;
            var splitAreaStyleOption = splitAreaOption.areaStyle;
            var areaColor = splitAreaStyleOption.color;

            lineColor = lineColor instanceof Array ? lineColor : [lineColor];
            areaColor = areaColor instanceof Array ? areaColor : [areaColor];

            var lineColorLen = lineColor.length;
            var areaColorLen = areaColor.length;

            var offset = (round(lineWidth) % 2) / 2;

            var x0 = grid.getX();
            var y0 = grid.getY();
            var x1 = grid.getXend();
            var y1 = grid.getYend();

            var ticksCoords = axis.getTicksCoords();
            var shapeList = this.shapeList;
            var zlevel = this.getZlevelBase();
            var z = this.getZBase();

            var isHorizontal = axis.isHorizontal();

            var prevX = 0;
            var prevY = 0;
            for (var i = 0; i < ticksCoords.length; i++) {

                var tickCoord = ticksCoords[i];
                var x = tickCoord + offset;
                var y = tickCoord + offset;

                // Draw split line
                if (splitLineOption.show) {
                    var shape = new LineShape({
                        zlevel: zlevel,
                        z: z,
                        hoverable: false,
                        style: {
                            strokeColor: lineColor[i % lineColorLen],
                            lineType: splitLineStyleOption.type,
                            lineWidth: lineWidth
                        }
                    });

                    var shapeStyle = shape.style;
                    if (isHorizontal) {
                        shapeStyle.xStart = shapeStyle.xEnd = x;
                        shapeStyle.yStart = y0;
                        shapeStyle.yEnd = y1;
                    }
                    else {
                        shapeStyle.yStart = shapeStyle.yEnd = y;
                        shapeStyle.xStart = x0;
                        shapeStyle.xEnd = x1;
                    }

                    shapeList.push(shape);
                }

                // Draw split area
                if (splitAreaOption.show && i > 0) {
                    var shape = new RectShape({
                        zlevel: zlevel,
                        z: z,
                        hoverable: false,
                        style: {
                            color: areaColor[i % areaColorLen]
                        }
                    });
                    var shapeStyle = shape.style;
                    if (isHorizontal) {
                        shapeStyle.x = prevX;
                        shapeStyle.y = y0;
                        // Math.abs in case coords is decreasing.
                        shapeStyle.width = Math.abs(x - prevX);
                        shapeStyle.height = y1 - y0;
                    }
                    else {
                        shapeStyle.x = x0;
                        shapeStyle.y = prevY;
                        shapeStyle.width = x1 - x0;
                        shapeStyle.height = Math.abs(y - prevY);
                    }
                    shapeList.push(shape);
                }

                prevX = x;
                prevY = y;
            }
        }
    };

    zrUtil.inherits(Axis, Base);

    // X Axis
    var XAxis = function () {
        Axis.apply(this, arguments);
    };
    XAxis.prototype = {
        
        constructor: XAxis,

        type: ecConfig.COMPONENT_TYPE_X_AXIS
    };
    zrUtil.inherits(XAxis, Axis);

    // Y Axis
    var YAxis = function () {
        Axis.apply(this, arguments);
    };
    YAxis.prototype = {
        
        constructor: YAxis,

        type: ecConfig.COMPONENT_TYPE_Y_AXIS
    };
    zrUtil.inherits(YAxis, Axis);

    component.define('axis', Axis);
    component.define('xAxis', XAxis);
    component.define('yAxis', YAxis);

    return Axis;
});
