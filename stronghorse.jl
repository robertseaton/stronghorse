using CSV
using DataFrames
using Plots
using Dates
using Debugger

function double_weight_if_single!(df::DataFrame)
    for row in eachrow(df)
        if occursin("One", row.Exercise) || occursin("Single", row.Exercise) || occursin("Dumbbell", row.Exercise) || occursin("Split", row.Exercise)
            row.Weight *= 2
        end
    end
    return df
end


function sum_weight_times_reps_by_date(df::DataFrame)
           # Step 1: Filter out rows where Weight is missing
           df = dropmissing(df, :Weight)
           
           # Step 2: Multiply Weight by Reps
           df.WeightTimesReps = df.Weight .* df.Reps
           
           # Step 3: Group by Date and sum the WeightTimesReps
           grouped_df = combine(groupby(df, :Date), :WeightTimesReps => sum => :TotalWeight)
           
           return grouped_df
end

function calculate_ctl(df::DataFrame; time_constant=42)
    # Initialize CTL array to store CTL values
    CTL = similar(df.TotalWeight, Float64)
    
    # Time constant (lambda) for the exponential weighting
    λ = 1 / time_constant
    
    # Calculate CTL iteratively
    for i in 1:length(df.TotalWeight)
        if i == 1
            CTL[i] = df.TotalWeight[i]  # Initial CTL is set to the first TSS value
        else
            CTL[i] = CTL[i-1] * (1 - λ) + df.TotalWeight[i] * λ
        end
    end
    
    # Add the CTL column to the original DataFrame
    df.CTL = CTL
    
    return df
end

function calculate_atl(df::DataFrame; time_constant=7)
    # Initialize CTL array to store CTL values
    ATL = similar(df.TotalWeight, Float64)
    
    # Time constant (lambda) for the exponential weighting
    λ = 1 / time_constant
    
    # Calculate ATL iteratively
    for i in 1:length(df.TotalWeight)
        if i == 1
            ATL[i] = df.TotalWeight[i]  # Initial ATL is set to the first TSS value
        else
            ATL[i] = ATL[i-1] * (1 - λ) + df.TotalWeight[i] * λ
        end
    end
    
    # Add the CTL column to the original DataFrame
    df.ATL = ATL
    
    return df
end

function replace_missing_with_zero!(df::DataFrame)
    for col in names(df)
        df[!, col] = coalesce.(df[!, col], 0)
    end
    return df
end

df = CSV.read("/home/rps/downloads/data.csv", DataFrame)
df_mod = double_weight_if_single!(df)
load = sum_weight_times_reps_by_date(df_mod)
load_mod = replace_missing_with_zero!(load)
date_range = minimum(load_mod.Date):Day(1):maximum(df.Date)
alldates = DataFrame(Date = date_range)
alldates = leftjoin(alldates, load_mod, on = :Date)
alldates[!, :TotalWeight] .= coalesce.(alldates[!, :TotalWeight], 0)
sort!(alldates, :Date)
alldates = calculate_ctl(alldates)
alldates = calculate_atl(alldates)
alldates[:, :TSB] = alldates.CTL .- alldates.ATL
lower_bound = alldates.CTL .- 1.10 .* alldates.CTL

plot(alldates.Date, alldates.CTL, label="CTL", xlabel="Date", ylabel="CTL", title="CTL, ATL, TSB vs Date", legend=:bottomleft)
# hline!([0], color=:black, linestyle=:dash, linewidth=2)
plot!(alldates.Date, lower_bound, fillrange=0, fillalpha=0.1, color=:green, label="Ideal", alpha=0)
plot!(alldates.Date, alldates.ATL, label="ATL")
plot!(alldates.Date, alldates.TSB, label="TSB")
plot!(yticks=:auto, yformatter = y -> string(Int(round(y))))
savefig("ctl.png")
println("Current CTL: ", alldates.CTL[end])
println("Current TSB: ", alldates.TSB[end])
println("Latest workout's load: ", alldates.TotalWeight[end])
