var share_data;
var debug_;

function get_human_readable_time(time){
    minutes = (time > 60) ? Math.floor(time/60) : 0;
    seconds = (time%60).toFixed(0);
    return `${minutes}:${seconds}`;
}

function parse_and_show_pluslife_result(overall_result, channel_results){
    const result_enum = {1: 'Negative', 2: 'Positive', 3: 'Invalid'};
    const result_color = {1: 'success', 2: 'danger', 3: 'dark'};
    document.getElementById('testresult').innerHTML = "Pluslife says: " + result_enum[overall_result];
    channel_results_html = '';
    for (const [channel, data] of Object.entries(channel_colors)) {
        var result = result_enum[channel_results[Number(channel)]];
        var color = result_color[channel_results[Number(channel)]];
        if (channel == "3"){
            result = (result == "Positive") ? "Detected" : "Not Detected";
            color = (result == "Detected") ? "primary" : color;
        }

        channel_results_html += `<span class="badge badge-${color}">${channel}: ${result.slice(0,3)}</span>`;

    }
    document.getElementById('testresult_channels').innerHTML = channel_results_html;
}

function encode_binary_share(){
    // version8, results16, time32, cs8, 36x data64 => up to 296Byte
    // cs = 7bits "is channel shifted?", 8th bit unused. shift means the value is shifted by 1 to the left
    //      -> this is to fit "normal" values into 8bit, while preserving high-starting graphs
    //      -> (with lowered precision, as they are allways invalid data)
    // data = time8 + 7(channels) * 8(value)bit
    var share_data_buffer = new ArrayBuffer(330);
    var dv = new DataView(share_data_buffer);
    var index = 0;

    var results = share_data.overall_result;
    share_data.result_channels.forEach((result) => {
        results <<= 2;
        results += result;
    });
    dv.setUint16(index, results);
    index += 2;

    dv.setUint32(index, share_data.timestamp /= 1000);
    index += 4;

    //initial time
    var time_data = Math.floor(share_data.sampledata[0].samplingTime/300);
    dv.setUint8(index++, time_data);

    const channel_data = new Uint16Array(7).fill(0);
    share_data.sampledata.forEach((sample) => {
        if (channel_data[sample.startingChannel] == 0){
            channel_data[sample.startingChannel] = sample.firstChannelResult/64;
            dv.setUint16(index, channel_data[sample.startingChannel]);
            index += 2;
            //console.log(`Initial: Ch:${sample.startingChannel}=${channel_data[sample.startingChannel]}`);
        }
    });

    var time_set = 0;
    share_data.sampledata.forEach((sample) => {
        const time = Math.floor(sample.samplingTime/300);
        if (time != time_set) {
            if (time_set != 0)  // if first iteration. Could be refactored
                index += Object.keys(channel_colors).length
            time_set = time;

            // if normal progression (+2) then add 0, else the normal difference
            dv.setUint8(index++, (time == time_data + 2) ? 0 : time - time_data);
            time_data = time;
        }

        var value = sample.firstChannelResult/64;
        //console.log(`Index: ${index + Number(sample.startingChannel)} | Time: ${time} (${(time == time_data + 2) ? 0 : time - time_data)}) - Ch:${sample.startingChannel}=${value} (${value - channel_data[sample.startingChannel]})`)
        dv.setInt8(index + sample.startingChannel, value - channel_data[sample.startingChannel]);
        channel_data[sample.startingChannel] = value;
    });

    return share_data_buffer.slice(0, index + Object.keys(channel_colors).length);
}

function decode_binary_share(share_data_uint8) {
    // result16, time32, initialtime8, 7x initialdata16, 36x data64 => 300byte
    // cs = 7bits "is channel shifted?", 8th bit unused. shift means the value is shifted by 1 to the left
    //      -> this is to fit "normal" values into 8bit, while preserving high-starting graphs
    //      -> (with lowered precision, as they are allways invalid data)
    // data = time8 + 7(channels) * 8(value)bit
    const dv = new DataView(share_data_uint8);
    var index = 0;

    const result_binary_str_array = dv.getUint16(index).toString(2).padStart(16, '0').split('');
    const result_channels = Array();
    const overall_result = parseInt(Number(result_binary_str_array[0] + result_binary_str_array[1]), 2);
    for (i=2;i<result_binary_str_array.length;i+=2){
        result_channels.push(
                             parseInt(
                                      Number(result_binary_str_array[i] + result_binary_str_array[i+1])
                                      , 2)
        );
    }
    index += 2;

    const timestamp = dv.getUint32(index) * 1000;
    index += 4;

    var current_time = dv.getUint8(index++) * 300;

    const channel_data = Array();
    Object.keys(channel_colors).forEach(() => {
        channel_data.push(dv.getUint16(index)*64);
        index += 2;
    })

    var first_iteration = true;
    var sampledata = Array();
    while (index < share_data_uint8.byteLength) {
        const timediff = dv.getUint8(index++) * 300;
        if (first_iteration){
            first_iteration = false;
        }
        else {
            // if normal progression (+1min/600msec) then timediff is 0, else the normal difference
            current_time += (timediff == 0) ?  600 : timediff;
        }

        for (channel=0;channel<7;channel++) {
            var channeldiff = dv.getInt8(index++) * 64;

            sampledata.push({samplingTime: current_time, firstChannelResult: channel_data[channel] + channeldiff, startingChannel: channel});
            //console.log(`Time: ${current_time} - Ch:${channel}=${channel_data[channel] + channeldiff} (${channeldiff})`);
            channel_data[channel] = channel_data[channel] + channeldiff;
        }
    }
    return [timestamp, overall_result, result_channels, sampledata];
}

function parse_and_show_test(event){
	const str = event.target.result;
	try {
        var json = JSON.parse(str);
        document.getElementById('show_file-validation').hidden = true;

    } catch (e) {
        error = "Could not read Testdata! Please report the following error, together with your testdata: <br />";
        error += `<hr />${event.target.fileName}<br />${e}<br />`
        for (var i = 0; i < 50; i++ )
            error += str[i];

        document.getElementById('show_file-validation').innerHTML = error + '<hr />';
        document.getElementById('show_file-validation').hidden = false;
        return;
    }
    update_chart(Date.parse(json.testData.temperatureSamples[0].time),
                 json.testResult.detectionResult, json.testResult.channelResults,
                 json.testData.samples);
}

function update_chart(timestamp, overall_result, result_channels, sampledata){
    share_data = {
        timestamp: timestamp,
        overall_result: overall_result,
        result_channels: result_channels,
        sampledata: sampledata
    }

    document.getElementById('testdate').innerText = new Date(timestamp).toUTCString();

    if (overall_result || result_channels)
        parse_and_show_pluslife_result(overall_result, result_channels);

    document.getElementById('datacontainer').hidden = false;

    chart.data.labels.length = 0;
    chart.data.datasets.forEach((dataset) => {
        dataset.data.length = 0;
    });
    var offset = -1;
    var data_index = 0;
    var filled_array = Array(1000).fill(-1);
    sampledata.forEach((sample) => {
        var human_readable_time = get_human_readable_time(Math.floor(sample.samplingTime/10));
        if (! chart.data.labels.includes(human_readable_time)){
            chart.data.labels.push(human_readable_time);
            offset += 1;
        }
        data_index = offset*7 + sample.startingChannel;
        filled_array[data_index] = sample.firstChannelResult/64;

        chart.data.datasets.forEach((dataset) => {
            if (dataset.channel == sample.startingChannel)
                dataset.data.push(sample.firstChannelResult);
        });
    });
    chart.update();
}

function intercept_upload(event) {
	event.preventDefault();

	let file = document.getElementById('show_file');
	if (!file.value.length) return;

	let reader = new FileReader();
	reader.fileName = file.files[0].name;
	reader.onload = parse_and_show_test;
	reader.readAsText(file.files[0]);
}

function decompress(byteArray, encoding) {
  const cs = new DecompressionStream(encoding);
  const writer = cs.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  return new Response(cs.readable).arrayBuffer()
  //.then(function (arrayBuffer) { return new TextDecoder().decode(arrayBuffer); });
}

function compress(byteArray, encoding) {
  const cs = new CompressionStream(encoding);
  const writer = cs.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  return new Response(cs.readable).arrayBuffer();
}


async function show_export_link(event){
    event.preventDefault();

    var share_data_buffer = encode_binary_share();
    console.log(`pre: ${share_data_buffer.byteLength}`);

    share_data_buffer = await compress(share_data_buffer, "deflate-raw")
    console.log(`comp: ${share_data_buffer.byteLength}`);

    var sharedata = btoa(String.fromCharCode(...new Uint8Array(share_data_buffer))).replaceAll("+", "-").replaceAll("/", "_");
    console.log(`b64: ${sharedata.length}`);

    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.append("share", sharedata)
    navigator.clipboard.writeText(url.href);
    if (navigator.canShare)
        navigator.share(url.href);

    var result = document.getElementById("share_form-result");
    result.innerHTML = "Share Link: " + url.href;
    result.innerHTML += "<br />(sharelink copied to clipboard)";
    result.hidden = false;
}

async function load_shared_graph(sharedata) {
    var uint8_array = Uint8Array.from(atob(sharedata.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0))
    uint8_array = await decompress(uint8_array, "deflate-raw");

    update_chart(...decode_binary_share(uint8_array));
}

(function() {
    document.getElementById('show_file_form').addEventListener('submit', intercept_upload);
    document.getElementById('share_form').addEventListener('submit', show_export_link);
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('share'))
        load_shared_graph(urlParams.get('share'));
})();