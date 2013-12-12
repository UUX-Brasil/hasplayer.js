Custom.modules.ContextManager = function (){
    "use strict";

    return {
        system: undefined,
        debug: undefined,

        setContext: function(ctx) {
            this.debug.log("Custom.modules.ContextManager::setContext",ctx);
            if (ctx === "MSS") {
                // here we map specific Class
                this.system.mapClass('mp4Processor', MediaPlayer.dependencies.Mp4Processor);
                this.system.mapClass('indexHandler', Mss.dependencies.MssHandler);
                // this.system.mapValue('metricsExt', this.system.getObject('mssMetricsExt'));
                this.system.mapClass('fragmentController', Mss.dependencies.MssFragmentController);

            } else {
                this.system.mapClass('fragmentLoader', MediaPlayer.dependencies.FragmentLoader);
                // this.system.mapValue('metricsExt', this.system.getObject('dashMetricsExt'));
                this.system.mapClass('fragmentController', MediaPlayer.dependencies.FragmentController);
            }
        }
    };
};

Custom.modules.ContextManager.prototype =  {
    constructor: Custom.modules.ContextManager
};

