var chart;
var channel_colors = {
    "0": {"color": "#a6cee3", "name": "Channel 1"},
    "1": {"color": "#1f78b4", "name": "Channel 2"},
    "2": {"color": "#b2df8a", "name": "Channel 3"},
    "3": {"color": "#33a02c", "name": "Control Channel (4)"},
    "4": {"color": "#fb9a99", "name": "Channel 5"},
    "5": {"color": "#e31a1c", "name": "Channel 6"},
    "6": {"color": "#fdbf6f", "name": "Channel 7"}
};

var channel_time_data = {
    "0": new Map(),
    "1": new Map(),
    "2": new Map(),
    "3": new Map(),
    "4": new Map(),
    "5": new Map(),
    "6": new Map()
};

var labels = [];
var datasets = {};
for (const [channel, time_values] of Object.entries(channel_time_data)) {
    datasets[channel] = {
        label: channel_colors[channel].name,
        borderColor: channel_colors[channel].color,
        fill: false,
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
        channel: channel,
        data: []
    }
    //TODO: gaps?
    for (const [time, value] of time_values.entries()) {
        if (! labels.includes(time)) labels.push(time);
        datasets[channel].data.push(value);
    }
}

var config = {
  type: 'line',
  data: {
    labels: labels,
    datasets: Object.values(datasets)
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    aspectRatio: 2,
    interaction: {
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          boxWidth: 10
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: "Test Time [min:sec]"
        }
      },
      y: {
        display: true,
        //suggestedMin: -10,
        //suggestedMax: 200
      }
    },
    elements: {
      point: {
        radius: 2,
      }
    }
  },
};

function update_chart(obj){
    for (const [channel, data] of Object.entries(obj)) {
        for (var [time, value] of Object.entries(data)) {
            time = Number(time);  // js json keys are always strings...
            channel_time_data[channel].set(time, value);

            if (! chart.data.labels.includes(time)) {
                chart.data.labels.push(time);
                var progress_html = document.getElementById('status').getElementsByTagName('progress')[0];

                time_remaining = 35*60 - time;
                minutes_remaining = (time_remaining/60).toFixed(0);
                seconds_remaining = (time_remaining%60);
                human_readable_remaining = `${minutes_remaining}:${seconds_remaining} min`;

                progress_html.innerHTML = human_readable_remaining;
                progress_html.value = time;
                document.getElementById('timeremaining').innerHTML = `${human_readable_remaining} remaining`;
            }

            chart.data.datasets.forEach((dataset) => {
                if (dataset.channel == channel)
                    dataset.data.push(value);
            });
        }
    }
    if (obj) chart.update();
}

(function() {
    chart = new Chart(document.getElementById('data'), config);
})();

