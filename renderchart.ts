import { CandleStick } from './candlestick';
var fs = require('fs');
const d3 = require('d3');
const d3node = require('d3-node');
const techan = require('techan');
const svgexport = require('svgexport');
const child_proc = require('child_process');
const path = require('path');
const styles = `body {
        font: 10px sans-serif;
    }

    text {
        fill: #000;
    }

    svg {
        background: white;
    }
    
    button {
        position: absolute;
        right: 20px;
        top: 440px;
        display: none;
    }

    path.candle {
        stroke: #000000;
    }

    path.candle.body {
        stroke-width: 0;
    }

    path.candle.up {
        fill: #00AA00;
        stroke: #00AA00;
    }

    path.candle.down {
        fill: #FF0000;
        stroke: #FF0000;
    }

    .trendline {
        stroke: blue;
        stroke-width: 0.8;
    }

    .trendline circle {
        stroke-width: 0;
        display: none;
    }

    `;

// Render a chart using techan charts, d3n and svgexport. Most of this code is copied from techan example code.
export class RenderChart {

    d3n = new d3node({d3module: d3, styles:styles})      // initializes D3 with container element 
    
    margin = {top: 20, right: 20, bottom: 30, left: 70};
            imagewidth = 960;
            imageheight = 500;
            width = this.imagewidth - this.margin.left - this.margin.right;
            height = this.imageheight - this.margin.top - this.margin.bottom;

    x = techan.scale.financetime()
        .range([0, this.width]);

    y = d3.scaleLinear()
        .range([this.height, 0]);

    candlestick = techan.plot.candlestick()
            .xScale(this.x)
            .yScale(this.y);

    trendline = techan.plot.trendline()
            .xScale(this.x)
            .yScale(this.y);

    xAxis = d3.axisBottom()
            .scale(this.x);

    yAxis = d3.axisLeft()
            .scale(this.y);
    
    svg = null;

    render = (candles: Array<CandleStick>, value, basedata, filename: string, header: string, callback) => {
        
        this.svg = this.d3n.createSVG(this.imagewidth,this.imageheight)
        .append("g")
        .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        var accessor = this.candlestick.accessor();
    
        // Reverse and remap tha candles into a new array, techan wants the newest candle first
        let data = candles.reverse().map(d => {
            return {
                date: new Date(d.start_time*1000),
                open: +d.open,
                high: +d.high,
                low: +d.low,
                close: +d.close,
                volume: 0
            };                    
            
        });

        this.svg.append("g")
                .attr("class", "candlestick");
    
        this.svg.append("g")
                .attr("class", "trendlines");
    
        this.svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + this.height + ")");
    
        this.svg.append("g")
                .attr("class", "y axis")
                .append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", 6)
                .attr("dy", ".71em")
                .style("text-anchor", "end")
                .text("Price");

        this.svg.append("g")
                .append("text")
                .attr("x", 30)
                .attr("y", 5)
                .text(header);                    

        // Use trendlines to draw the base and the current price line
        var trendlineData = [
            { start: { date: basedata.FromTime, value: basedata.Level }, end: { date: basedata.ToTime, value: basedata.Level } },
            { start: { date: data[0].date, value: value }, end: { date: data[data.length-1].date, value: value } },                
        ];
    
        this.draw(data, trendlineData);

        // Replace all spaces in the filename with underscore
        while(filename.indexOf(' ')>0) {
            filename = filename.replace(' ', '_');
        }

        let tempfile = filename + ".svg";
        let outputfile = '../public_html/alerts/' + filename;
        // Write the svg to a temporary file
        fs.writeFile(tempfile, this.d3n.svgString(), (err => {
            if(err)
                console.log('Error writing svg file: ' + err);

            // Render the svg to png with 70% compression
            svgexport.render({'input': tempfile, 'output': [[outputfile, '70%']]}, cb => {
                // Delete the temporary file after rendering
                fs.unlink(tempfile, (err) => {
                    if(err)
                        console.log('Error unlinking file: ' + err);
                    callback(filename);
                });
            });    
        }));
    }    

    draw = (data, trendlineData) => {
        this.x.domain(data.map(this.candlestick.accessor().d));
        this.y.domain(techan.scale.plot.ohlc(data, this.candlestick.accessor()).domain());
        
        this.svg.selectAll("g.candlestick").datum(data).call(this.candlestick);
        this.svg.selectAll("g.x.axis").call(this.xAxis);
        this.svg.selectAll("g.y.axis").call(this.yAxis);
        this.svg.selectAll("g.trendlines").datum(trendlineData).call(this.trendline);
    }
}