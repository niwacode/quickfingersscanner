// Contains one candle
export class CandleStick
{
    open: number;
    close: number;
    high: number;
    low: number;
    start_time: number;
    bodylow = () => {
        return Math.min(this.open, this.close);
    }
    bodyhigh = () => {
        return Math.max(this.open, this.close);
    }
}
