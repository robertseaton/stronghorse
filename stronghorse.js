document.getElementById('csvFileInput').addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const csvData = e.target.result;
            const parsedData = parseCSV(csvData);
            const dailyLoad = calculateDailyLoad(parsedData);
            const filledDailyLoad = fillMissingDates(dailyLoad);
            const ctlData = calculateCTL(filledDailyLoad, 42);  // 42-day time constant for CTL
            const atlData = calculateCTL(filledDailyLoad, 7);   // 7-day time constant for ATL
            const tsbData = calculateTSB(ctlData, atlData);     // Calculate TSB (CTL - ATL)
	    const idealTSB = calculateIdealTSB(ctlData);
            renderChart(ctlData, atlData, tsbData, idealTSB, filledDailyLoad);
        };
        reader.readAsText(file);
    }
}

function parseCSV(data) {
    const lines = data.split('\n');
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, header, i) => {
            obj[header.trim()] = values[i] ? values[i].trim() : null;
            return obj;
        }, {});
    });
    return rows;
}

function calculateDailyLoad(data) {
    const loadByDate = data.reduce((acc, entry) => {
        const date = entry.Date;
        let weight = parseFloat(entry.Weight) || 0;
        const reps = parseInt(entry.Reps) || 0;

        // Double the weight if the exercise name contains specified keywords
        const keywords = ["One", "Single", "Dumbbell", "Split"];
        if (keywords.some(keyword => entry.Exercise.toLowerCase().includes(keyword.toLowerCase()))) {
            weight *= 2;
        }

        const load = weight * reps;

        if (!acc[date]) {
            acc[date] = 0;
        }
        acc[date] += load;

        return acc;
    }, {});

    return Object.entries(loadByDate).sort((a, b) => new Date(a[0]) - new Date(b[0]));
}

function fillMissingDates(dailyLoad) {
    const fullLoad = [];
    const dateRange = getDateRange(dailyLoad[0][0], dailyLoad[dailyLoad.length - 1][0]);

    const loadMap = dailyLoad.reduce((acc, [date, load]) => {
        acc[date] = load;
        return acc;
    }, {});

    dateRange.forEach(date => {
        fullLoad.push([date, loadMap[date] || 0]);
    });

    return fullLoad;
}

function getDateRange(startDate, endDate) {
    const dateRange = [];
    let currentDate = new Date(startDate);

    while (currentDate <= new Date(endDate)) {
        dateRange.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dateRange;
}

function calculateCTL(dailyLoad, timeConstant) {
    const ctlData = [];
    const lambda = 1 / timeConstant;
//    let previousCTL = dailyLoad[0][1];  // Initial CTL is set to the first load value
    let previousCTL = 0;  // Initial CTL is set to the first load value
    dailyLoad.forEach(([date, load], index) => {
        if (index > 0) {
            previousCTL = previousCTL * (1 - lambda) + load * lambda;
        }
        ctlData.push({ date, ctl: previousCTL });
    });

    return ctlData;
}

function calculateTSB(ctlData, atlData) {
    return ctlData.map((entry, index) => ({
        date: entry.date,
        tsb: entry.ctl - atlData[index].ctl
    }));
}

function calculateIdealTSB(ctlData) {
    // Calculate ideal TSB at -0.73% of CTL
    return ctlData.map(entry => ({
        date: entry.date,
        tsb: -0.0073 * entry.ctl
    }));
}

function renderChart(ctlData, atlData, tsbData, idealTSB, dailyLoad) {
    const labels = ctlData.map(entry => entry.date);
    const ctlValues = ctlData.map(entry => entry.ctl);
    const atlValues = atlData.map(entry => entry.ctl);
    const tsbValues = tsbData.map(entry => entry.tsb);
    const idealTSBValues = idealTSB.map(entry => entry.tsb);
    const loadValues = dailyLoad.map(([date, load]) => load);

    const ctx = document.getElementById('exerciseChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Fitness',
                    data: ctlValues,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    fill: false,
                },
                {
                    label: 'Load',
                    data: loadValues,
                    borderColor: 'rgba(255, 206, 86, 0.2)',
                    backgroundColor: 'rgba(255, 206, 86, 0.3)',
                    borderWidth: 1,
                    fill: false,
                    type: 'bar',
                },
                {
                    label: 'Stress',
                    data: atlValues,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 2,
                    fill: false,
                },
                {
                    label: 'Recovery',
                    data: tsbValues,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    fill: false,
                },
                {
                    label: 'Goldilocks Zone',
                    data: idealTSBValues,
                    backgroundColor: 'rgba(144, 238, 144, 0.8)',
                    borderColor: 'rgba(144, 238, 144, 0.8)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                }
            ]
        },
        options: {
	    elements: {
		point: {
                    radius: 1 // This removes the bubbles marking each point
		}
            },
            plugins: {
                annotation: {
                    annotations: {
                        shadedBand: {
                            type: 'box',
                            yMin: function(context) {
                                const lastCTL = ctlValues[ctlValues.length - 1];
                                return -0.1 * lastCTL;  // -10% of the last CTL value
                            },
                            yMax: 0,
                            backgroundColor: 'rgba(144, 238, 144, 0.2)',  // Light green background
                            borderColor: 'rgba(144, 238, 144, 0.2)',      // Darker green border
                            borderWidth: 1,
                            label: {
                                content: 'Shaded Band (-10% CTL)',
                                enabled: true,
                                position: 'center'
                            }
                        }
                    }
                }
            }
        }
    });
}


