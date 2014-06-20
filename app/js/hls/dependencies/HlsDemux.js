
/*
 * The copyright in this software is being made available under the BSD License, included below. This software may be subject to other third party and contributor rights, including patent rights, and no such rights are granted under this license.
 * 
 * Copyright (c) 2013, Orange
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * •  Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * •  Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * •  Neither the name of the Digital Primates nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */



Hls.dependencies.HlsDemux = function () {
    "use strict";

    var pat = null,
        pmt = null,
        pidToTrackId = [],
        tracks = [],

        getTsPacket = function (data, pid, pusi) {

            var i = 0;

            while (i < data.length) {
                var tsPacket = new mpegts.ts.TsPacket();
                tsPacket.parse(data.subarray(i, i + mpegts.ts.TsPacket.prototype.TS_PACKET_SIZE));

                this.debug.log("[HlsDemux] TS packet: pid=" + tsPacket.getPid() + ", pusi = " + tsPacket.getPusi());
                
                if ((tsPacket.getPid() === pid) && ((pusi === undefined) || (tsPacket.getPusi() === pusi))) {
                    return tsPacket;
                }
                
                i += mpegts.ts.TsPacket.prototype.TS_PACKET_SIZE;
            }

            return null;
        },

        getPAT = function (data) {

            var tsPacket = getTsPacket.call(this, data, mpegts.ts.TsPacket.prototype.PAT_PID);

            if (tsPacket === null) {
                return null;
            }


            pat = new mpegts.si.PAT();
            pat.parse(tsPacket.getPayload());

            this.debug.log("[HlsDemux] PAT: PMT_PID=" + pat.getPmtPid());

            return pat;
        },

        getPMT = function (data, pid) {

            var tsPacket = getTsPacket.call(this, data, pid);

            if (tsPacket === null) {
                return null;
            }

            pmt = new mpegts.si.PMT();
            pmt.parse(tsPacket.getPayload());

            this.debug.log("[HlsDemux] PMT");

            var trackIdCounter = 1;// start at 1
            for (var i = 0; i < pmt.m_listOfComponents.length; i++) {
                var elementStream = pmt.m_listOfComponents[i];
                var track = new MediaPlayer.vo.Mp4Track();
                switch (elementStream.m_stream_type) {
                    case mpegts.si.PMT.prototype.MPEG2_VIDEO_STREAM_TYPE ://0x02
                        //track.type = 'video';
                        console.log("HlsDemux.getPMT() => MPEG2_VIDEO_STREAM_TYPE detected but not implemented!");
                        break;
                    case mpegts.si.PMT.prototype.AVC_VIDEO_STREAM_TYPE ://0x1B
                        track.type = 'video';
                        track.streamType="h264";
                        break;
                    case mpegts.si.PMT.prototype.MPEG1_AUDIO_STREAM_TYPE ://0x03
                        //track.type = 'audio';
                        console.log("HlsDemux.getPMT() => MPEG1_AUDIO_STREAM_TYPE detected but not implemented!");
                        break;
                    case mpegts.si.PMT.prototype.MPEG2_AUDIO_STREAM_TYPE ://0x04
                        //track.type = 'audio';
                        console.log("HlsDemux.getPMT() => MPEG2_AUDIO_STREAM_TYPE detected but not implemented!");
                        break;
                    case mpegts.si.PMT.prototype.AAC_AUDIO_STREAM_TYPE  ://0x11
                        track.type = 'audio';
                        track.streamType="aac";
                        break;
                    case mpegts.si.PMT.prototype.AC3_AUDIO_STREAM_TYPE  ://0x06
                        //track.type = 'audio';
                        console.log("HlsDemux.getPMT() => AC3_AUDIO_STREAM_TYPE detected but not implemented!");
                        break;
                    case mpegts.si.PMT.prototype.SUB_STREAM_TYPE ://0x06
                        console.log("HlsDemux.getPMT() => SUB_STREAM_TYPE detected but not implemented!");
                        break;
                    default :
                        console.log("HlsDemux.getPMT() => unknown stream type ="+elementStream.m_stream_type+" detected but not implemented!");
                }
                track.timescale = mpegts.Pts.prototype.SYSTEM_CLOCK_FREQUENCY;
                track.pid = elementStream.m_elementary_PID;
                track.trackId = trackIdCounter;
                pidToTrackId[elementStream.m_elementary_PID] = trackIdCounter;
                tracks.push(track);
                trackIdCounter ++;
            }

            return pmt;
        },

        demuxTsPacket = function(data) {
            var tsPacket,
                pid,
                trackId,
                track,
                sample = null;

            tsPacket = new mpegts.ts.TsPacket();
            tsPacket.parse(data);

            // If packet has only adaptation field, then ignore
            if (tsPacket.hasAdaptationFieldOnly()) {
                return;
            }

            // Get PID and corresponding track
            pid = tsPacket.getPid();
            trackId = pidToTrackId[pid];
            if (trackId === undefined) {
                return;
            }

            track = tracks[trackId];

            // PUSI => start storing new AU
            if (tsPacket.getPusi()) {

                // Parse PES header
                var pesPacket = new mpegts.pes.PesPacket();
                pesPacket.parse(tsPacket.getPayload());

                // Store new access unit
                sample = new MediaPlayer.vo.Mp4Track.Sample();
                sample.dts = pesPacket.getDts();
                sample.pts = pesPacket.getPts();
                sample.size = 0;
                sample.subSamples = [];

                // Store payload of PES packet as a subsample
                sample.subSamples.push(pesPacket.getPayload());

                track.samples.push(sample);
            }
            else {
                // Get currently buffered access unit
                if (track.samples.length > 0) {
                    sample = track.samples[track.samples.length - 1];
                }

                // Store payload of TS packet as a subsample
                sample.subSamples.push(tsPacket.getPayload());
            }
        },

        postProcess = function(track) {

            var sample,
                length = 0,
                offset = 0,
                i, s;

            // Re-assemble sub-sample parts into
            for (i = 0; i < track.samples.length; i++) {
                sample = track.samples[i];

                for (s = 0; s < sample.subSamples.length; s++) {
                    length += sample.subSamples[s].length;
                }
            }

            // Allocate track data
            track.data = new Uint8Array(length);

            for (i = 0; i < track.samples.length; i++) {
                sample = track.samples[i];

                // Copy all sub-sample parts into track data
                for (s = 0; s < sample.subSamples.length; s++) {
                    track.data.set(sample.subSamples[s], offset);
                    offset += sample.subSamples[s].length;
                }

                // 
                if (track.codecs.contains('avc')) {
                    mpegts.h264.bytestreamToMp4(track.data);
                }
            }

        },

        doInit = function () {
            pat = null;
            pmt = null;
            tracks = [];
        },

        getTrackCodecInfo = function (data, track) {

            var tsPacket;

            // Get first TS packet containing start of a PES/sample
            tsPacket = getTsPacket.call(this, data, track.pid, true);

            // Get PES packet
            var pesPacket = new mpegts.pes.PesPacket();
            pesPacket.parse(tsPacket.getPayload());

            if (track.streamType === "h264") {
                //track.codecs
                track.codecPrivateData = mpegts.h264.getSequenceHeader(pesPacket.getPayload());
            }

        },

        doGetTracks = function (data) {

            var i;

            // Parse PSI (PAT, PMT) if not yet received
            if (pat === null) {
                pat = getPAT.call(this, data);
                if (pat === null) {
                    return;
                }
            }

            if (pmt === null) {
                pmt = getPMT.call(this, data, pat.getPmtPid());
                if (pmt === null) {
                    return;
                }
            }

            // Get track information
            for (i = 0; i < tracks.length; i++) {
                if (tracks[i].codecPrivateData === "") {
                    //getTrackCodecInfo.call(this, data, tracks[i]);
                }
            }

            return tracks;
        },

        doDemux = function (data) {

            var nbPackets = data.length / mpegts.ts.TsPacket.prototype.TS_PACKET_SIZE,
                i = 0;

            this.debug.log("[HlsDemux] Demux chunk, size = " + data.length + ", nb packets = " + nbPackets);

            // Get PAT, PMT and tracks information if not yet received
            doGetTracks.call(this, data);

            // If PMT not received, then unable to demux
            if (pmt === null) {
                return tracks;
            }

            // Parse and demux TS packets
            i = 0;
            while (i < data.length) {

                demuxTsPacket.call(this, data.subarray(i, i + mpegts.ts.TsPacket.prototype.TS_PACKET_SIZE));
                i += mpegts.ts.TsPacket.prototype.TS_PACKET_SIZE;
            }

            // Re-assemble samples from sub-samples
            for (i = 0; i < tracks.length; i++) {
                postProcess.call(this, tracks[i]);
            }

            return tracks;
        };

    return {
        debug: undefined,

        init: doInit,
        getTracks: doGetTracks,
        demux: doDemux
    };
};

Hls.dependencies.HlsDemux.prototype = {
    constructor: Hls.dependencies.HlsDemux
};

