/**
 * echarts组件类： 坐标轴
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
 * * Time formattter
 * * Label rotation
 *
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

    function isHorizontal (position) {
        return position === 'top' || position === 'bottom';
    }

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

            if (newOption) {
                this.option = this.reformOption(newOption);
            }
            var option = this.option;

            var grid = this.component.grid;

            var axisType = this.type;
            var axisTypeShort = axisType.slice(0, 1);
            var axesOption = option[axisType];

            for (var i = 0; i < axesOption.length; i++) {
                var axis = grid.getAxis(axisTypeShort, i);
                this._buildShape(axis, axesOption[i]);
            }
        },

        _buildShape: function (axis, option) {

            option.axisLine.show && this._buildAxisLine(axis, option);
            option.axisTick.show && this._buildAxisTick(axis, option);
            option.axisLabel.show && this._buildAxisLabel(axis, option);
            
            this._buildSplitLineArea(axis, option);

            var shapeList = this.shapeList;
            for (var i = 0, l = shapeList.length; i < l; i++) {
                this.zr.addShape(shapeList[i]);
            }
        },

        // 轴线
        _buildAxisLine: function (axis, option) {
            var lineStyleOption = option.axisLine.lineStyle;
            var lineWidth = lineStyleOption.width;
            var halfLineWidth = lineWidth / 2;
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

            var zeroCoord = axis.dataToCoord(0, true);
            var onZero = option.axisLine.onZero;

            // Sub pixel optimize
            var offset = (1 - lineWidth % 2) / 2;
            halfLineWidth += offset;
            switch (axis.position) {
                case 'left':
                    if (onZero) {
                        xStart = xEnd = zeroCoord;
                    }
                    else {
                        xStart = xEnd = x0 - halfLineWidth;   
                    }
                    yStart = y1;
                    yEnd = y0;
                    break;
                case 'right':
                    if (onZero) {
                        xStart = xEnd = zeroCoord;
                    }
                    else {
                        xStart = xEnd = x1 + halfLineWidth;
                    }
                    yStart = y1;
                    yEnd = y0;
                    break;
                case 'bottom':
                    xStart = x0;
                    xEnd = x1;
                    if (onZero) {
                        yStart = yEnd = zeroCoord;
                    }
                    else {
                        yStart = yEnd = y1 + halfLineWidth;
                    }
                    break;
                case 'top':
                    xStart = x0;
                    xEnd = x1;
                    if (onZero) {
                        yStart = yEnd = zeroCoord;
                    }
                    else {
                        yStart = yEnd = y1 - halfLineWidth;
                    }
                    break;
            }
            var style = axShape.style;
            var nameTextStyleOption = option.nameTextStyle;
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
            var grid = this.component.grid;

            var x0 = grid.getX();
            var y0 = grid.getY();

            // Sub pixel optimize
            var offset = (1 - tickLineWidth % 2) / 2;

            var offX = 0;
            var offY = 0;

            var stepX = 0;
            var stepY = 0;

            var axisPosition = axis.position;

            if (isHorizontal(axisPosition)) {
                offY = axisPosition === 'top' ? -tickLen : tickLen;
                stepX = 1;
            }
            else {
                offX = axisPosition === 'left' ? -tickLen : tickLen;
                stepY = 1;
            }
            if (tickOption.inside) {
                offX = -offX;
                offY = -offY;
            }

            var ticksCoords = axis.getTicksCoords();

            for (var i = 0; i < ticksCoords.length; i++) {
                var tickCoord = ticksCoords[i] + offset;

                var x = x0 + tickCoord * stepX;
                var y = y0 + tickCoord * stepY;

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
            var grid = this.component.grid;
            
            var labelOption = option.axisLabel;
            var labelMargin = labelOption.margin;
            var textStyle = labelOption.textStyle;

            var labelMarginX = 0;
            var labelMarginY = 0;
            var labelTextAlign = 'center';
            var labelTextBaseline = 'middle';
            var labelRotate = labelOption.rotate;

            var stepX = 0;
            var stepY = 0;

            var axisPosition = axis.position;

            if (isHorizontal(axisPosition)) {
                stepX = 1;
                if (axisPosition === 'top') {
                    labelMarginY = -labelMargin;
                    labelTextBaseline = 'bottom';
                }
                else {
                    labelMarginY = labelMargin;
                    labelTextBaseline = 'top';
                }
            }
            else {
                stepY = 1;
                if (axisPosition === 'left') {
                    labelMarginX = -labelMargin;
                    labelTextAlign = 'right';
                }
                else {
                    labelMarginX = labelMargin;
                    labelTextAlign = 'left';
                }
            }

            var formatter = labelOption.formatter;
            if (! formatter) {
                // Default formatter
                switch (option.type) {
                    // TODO
                    case 'log':
                    default:
                        formatter = this.numAddCommas;
                }
            }
            else if (typeof formatter === 'string') {
                formatter = (function (tpl) {
                    return function (val) {
                        return tpl.replace({'value}', val);
                    }
                })(formatter);
            }

            var ticks = axis.scale.getTicks();
            var x0 = grid.getX();
            var y0 = grid.getY();

            for (var i = 0; i < ticks.length; i++) {
                var tick = ticks[i];
                var tickCoord = axis.dataToCoord(tick);

                if (option.type === 'time') {
                    // TODO
                }
                var text = formatter(tick);

                var shape = new TextShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: x0 + tickCoord * stepX + labelMarginX,
                        y: y0 + tickCoord * stepY + labelMarginY,

                        text: text,
                        textFont: this.getFont(textStyle),
                        textAlign: labelTextAlign,
                        textBaseline: labelTextBaseline
                    }
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

            var offset = (1 - lineWidth % 2) / 2;

            var x0 = grid.getX();
            var y0 = grid.getY();
            var x1 = grid.getXend();
            var y1 = grid.getYend();

            var ticksCoords = axis.getTicksCoords();
            var shapeList = this.shapeList;
            var zlevel = this.getZlevelBase();
            var z = this.getZBase();

            var _isHorizontal = isHorizontal(axis.position);

            var prevX = 0;
            var prevY = 0;
            for (var i = 0; i < ticksCoords.length; i++) {

                var tickCoord = ticksCoords[i];
                var x = x0 + tickCoord + offset;
                var y = y0 + tickCoord + offset;

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
                    if (_isHorizontal) {
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
                    if (_isHorizontal) {
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
        },

        _axisLabelClickable: function(clickable, axShape) {
            if (clickable) {
                ecData.pack(
                    axShape, undefined, -1, undefined, -1, axShape.style.text
                );
                axShape.hoverable = true;
                axShape.clickable = true;
                axShape.highlightStyle = {
                    color: zrColor.lift(axShape.style.color, 1),
                    brushType: 'fill'
                };
                return axShape;
            }
            else {
                return axShape;
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
    zrUtil.inherits(XAxis, Base);

    // Y Axis
    var YAxis = function () {
        Axis.apply(this, arguments);
    };
    YAxis.prototype = {
        
        constructor: YAxis,

        type: ecConfig.COMPONENT_TYPE_X_AXIS
    };
    zrUtil.inherits(YAxis, Base);

    component.define('axis', Axis);
    component.define('xAxis', XAxis);
    component.define('yAxis', YAxis);

    return Axis;
});
