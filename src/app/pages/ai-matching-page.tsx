import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { NotificationBell } from "../components/notification-bell";
import { GlobalSidebar } from "../components/global-sidebar";
import { DashboardLayout } from "../components/dashboard-layout";
import { 
  Home, 
  Sparkles, 
  MapPin, 
  Clock, 
  Utensils,
  TrendingUp,
  Bell,
  User,
  LogOut,
  Target,
  Zap,
  Activity,
  Route,
  AlertCircle
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";

type RankedDonation = {
  id: string;
  name: string;
  quantity: string;
  donor: string;
  receiver: string;
  distance: string;
  expiry: string;
  urgencyScore: number;
  distanceScore: number;
  freshnessScore: number;
  impactScore: number;
  overallScore: number;
  reason: string;
};

const matchingFactors = [
  {
    name: "Distance",
    weight: "30%",
    description: "Proximity between donor and receiver",
    icon: MapPin,
    color: "bg-[#10b981]"
  },
  {
    name: "Urgency",
    weight: "25%",
    description: "Time until food expires",
    icon: Clock,
    color: "bg-[#f97316]"
  },
  {
    name: "Freshness",
    weight: "20%",
    description: "Food quality and condition",
    icon: Sparkles,
    color: "bg-[#3b82f6]"
  },
  {
    name: "Impact",
    weight: "15%",
    description: "Number of people that can be fed",
    icon: Target,
    color: "bg-[#8b5cf6]"
  },
  {
    name: "Capacity",
    weight: "10%",
    description: "Receiver's ability to handle volume",
    icon: Activity,
    color: "bg-[#06b6d4]"
  },
];

export function AIMatchingPage() {
  const [donations, setDonations] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
    });

    return () => unsubscribe();
  }, []);

  const rankedDonations = useMemo<RankedDonation[]>(() => {
    const now = Date.now();

    return donations
      .filter((donation) => !donation.claimed)
      .map((donation) => {
        const expiryTime = new Date(donation.expiryTime || now + 8 * 3600 * 1000).getTime();
        const hoursLeft = Math.max(1, Math.round((expiryTime - now) / (3600 * 1000)));
        const quantity = parseInt(donation.quantity, 10) || 0;
        const distanceNum = parseFloat(donation.routeDistance || donation.distance || "4.0") || 4;

        const urgencyScore = Math.max(30, 100 - hoursLeft * 8);
        const distanceScore = Math.max(35, 100 - Math.round(distanceNum * 12));
        const freshnessScore = Math.max(40, Math.min(100, 60 + (donation.foodType === "vegan" ? 20 : 10)));
        const impactScore = Math.max(35, Math.min(100, 45 + Math.round(quantity / 2)));
        const overallScore = Math.round(urgencyScore * 0.3 + distanceScore * 0.25 + freshnessScore * 0.2 + impactScore * 0.25);

        return {
          id: donation.id,
          name: donation.foodName || "Donation",
          quantity: donation.quantity || "-",
          donor: donation.donorEmail || "Live donor",
          receiver: donation.claimedBy || "Best nearby receiver",
          distance: `${distanceNum.toFixed(1)} km`,
          expiry: `${hoursLeft} hours`,
          urgencyScore,
          distanceScore,
          freshnessScore,
          impactScore,
          overallScore,
          reason: "Scored by urgency, proximity, freshness, and projected impact.",
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 8);
  }, [donations]);

  const aiStats = useMemo(() => {
    const total = donations.length || 1;
    const matched = donations.filter((donation) => donation.claimed).length;
    const successRate = Math.round((matched / total) * 100);
    const matchesToday = donations.filter((donation) => {
      const created = donation.createdAt?.toDate?.();
      if (!created) {
        return false;
      }
      const today = new Date();
      return created.toDateString() === today.toDateString();
    }).length;
    const confidence = rankedDonations.length > 0 ? Math.round(rankedDonations.reduce((sum, item) => sum + item.overallScore, 0) / rankedDonations.length) : 0;
    return {
      successRate,
      avgMatchTime: `${Math.max(1, Math.round(6 - Math.min(5, matched / 50)))}s`,
      matchesToday,
      confidence,
    };
  }, [donations, rankedDonations]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 p-6 flex flex-col shadow-xl">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
            <Utensils className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-semibold">RescueBite AI</span>
        </div>

        <nav className="flex-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#10b981] text-white transition-all">
            <Sparkles className="w-5 h-5" />
            <span>AI Matching</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 hover:bg-gray-100 transition-all">
            <Route className="w-5 h-5" />
            <span>Route Optimization</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 hover:bg-gray-100 transition-all">
            <Activity className="w-5 h-5" />
            <span>Performance</span>
          </button>
        </nav>

        <div className="border-t border-gray-200 pt-4">
          <Link to="/">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 hover:bg-gray-100 transition-all">
              <LogOut className="w-5 h-5" />
              <span>Back to Home</span>
            </button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <DashboardLayout className="flex-1">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">AI Smart Matching</h1>
              <p className="text-gray-600">Intelligent donation-receiver matching powered by AI</p>
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell audienceRole="admin" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="font-medium">AI System</div>
                  <div className="text-sm text-gray-600">Administrator</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-8 overflow-auto">
          {/* AI Matching Stats */}
          <div className="grid grid-cols-4 gap-1 md:gap-6 mb-8">
            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#d1fae5] flex items-center justify-center mb-1 md:mb-0">
                  <Sparkles className="w-4 h-4 md:w-6 md:h-6 text-[#047857]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{aiStats.successRate}%</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Success</div>
            </Card>

            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#dbeafe] flex items-center justify-center mb-1 md:mb-0">
                  <Zap className="w-4 h-4 md:w-6 md:h-6 text-[#1d4ed8]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{aiStats.avgMatchTime}</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Avg Time</div>
            </Card>

            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#fed7aa] flex items-center justify-center mb-1 md:mb-0">
                  <Activity className="w-4 h-4 md:w-6 md:h-6 text-[#c2410c]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{aiStats.matchesToday}</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Today</div>
            </Card>

            <Card className="p-1.5 md:p-6 rounded-lg md:rounded-3xl border-0 shadow-lg">
              <div className="flex flex-col items-center mb-2 md:mb-4">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#e9d5ff] flex items-center justify-center mb-1 md:mb-0">
                  <Target className="w-4 h-4 md:w-6 md:h-6 text-[#6d28d9]" />
                </div>
              </div>
              <div className="text-base md:text-3xl font-bold mb-0.5 md:mb-1 text-center">{aiStats.confidence}%</div>
              <div className="text-xs text-gray-600 text-center leading-tight">Accuracy</div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column - Ranked Donations */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-8 rounded-3xl border-0 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Ranked Matches</h2>
                  <Badge className="bg-[#d1fae5] text-[#047857] rounded-full px-4 py-2">
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI Powered
                  </Badge>
                </div>

                <div className="space-y-4">
                  {rankedDonations.map((donation, index) => (
                    <Card
                      key={donation.id}
                      className={`p-6 rounded-3xl border-2 transition-all hover:shadow-lg ${
                        index === 0 ? "border-[#10b981]" : "border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white ${
                                index === 0
                                  ? "bg-[#10b981]"
                                  : index === 1
                                  ? "bg-[#3b82f6]"
                                  : index === 2
                                  ? "bg-[#8b5cf6]"
                                  : "bg-gray-400"
                              }`}
                            >
                              #{index + 1}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg">{donation.name}</h3>
                              <p className="text-sm text-gray-600">{donation.quantity}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-[#10b981] mb-1">
                            {donation.overallScore}
                          </div>
                          <div className="text-sm text-gray-600">Match Score</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{donation.donor}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{donation.receiver}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Route className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{donation.distance}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">Expires in {donation.expiry}</span>
                        </div>
                      </div>

                      {/* Score Breakdown */}
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Urgency</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-[#f97316] h-1.5 rounded-full"
                                style={{ width: `${donation.urgencyScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold">{donation.urgencyScore}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Distance</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-[#10b981] h-1.5 rounded-full"
                                style={{ width: `${donation.distanceScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold">{donation.distanceScore}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Freshness</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-[#3b82f6] h-1.5 rounded-full"
                                style={{ width: `${donation.freshnessScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold">{donation.freshnessScore}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Impact</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-[#8b5cf6] h-1.5 rounded-full"
                                style={{ width: `${donation.impactScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold">{donation.impactScore}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-3 bg-[#d1fae5] rounded-2xl mb-4">
                        <Sparkles className="w-4 h-4 text-[#047857] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[#047857]">
                          <span className="font-semibold">AI Insight:</span> {donation.reason}
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <Button className="flex-1 rounded-full bg-[#10b981] hover:bg-[#047857]">
                          Approve Match
                        </Button>
                        <Button variant="outline" className="flex-1 rounded-full">
                          Adjust
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            </div>

            {/* Right Column - Recommendation Engine & Map */}
            <div className="space-y-6">
              {/* AI Matching Engine Panel */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">Matching Factors</h3>
                <div className="space-y-4">
                  {matchingFactors.map((factor) => (
                    <div key={factor.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl ${factor.color} flex items-center justify-center`}>
                            <factor.icon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="font-medium">{factor.name}</div>
                            <div className="text-xs text-gray-600">{factor.description}</div>
                          </div>
                        </div>
                        <div className="font-semibold text-sm">{factor.weight}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Route Optimization Map */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">Route Optimization</h3>
                <div className="bg-gradient-to-br from-[#d1fae5] to-[#dbeafe] rounded-2xl h-64 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-20">
                    {/* Live route preview lines */}
                    <svg className="w-full h-full">
                      <line x1="20%" y1="30%" x2="80%" y2="70%" stroke="#10b981" strokeWidth="3" />
                      <line x1="80%" y1="70%" x2="60%" y2="40%" stroke="#3b82f6" strokeWidth="3" />
                      <line x1="60%" y1="40%" x2="40%" y2="80%" stroke="#8b5cf6" strokeWidth="3" />
                    </svg>
                    <div className="absolute top-1/4 left-1/4 w-4 h-4 bg-[#10b981] rounded-full animate-pulse"></div>
                    <div className="absolute top-1/2 right-1/3 w-4 h-4 bg-[#3b82f6] rounded-full animate-pulse"></div>
                    <div className="absolute bottom-1/3 left-1/2 w-4 h-4 bg-[#8b5cf6] rounded-full animate-pulse"></div>
                  </div>
                  <div className="text-center z-10">
                    <Route className="w-12 h-12 text-[#10b981] mx-auto mb-2" />
                    <p className="font-medium text-gray-700">Optimized Routes</p>
                    <p className="text-sm text-gray-600">AI-calculated delivery paths</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Distance</span>
                    <span className="font-semibold">24.3 km</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Est. Time</span>
                    <span className="font-semibold">42 min</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Efficiency</span>
                    <span className="font-semibold text-[#10b981]">95%</span>
                  </div>
                </div>
              </Card>

              {/* AI Performance */}
              <Card className="p-6 rounded-3xl border-0 shadow-lg">
                <h3 className="font-bold mb-4">AI Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Successful Matches</span>
                    <span className="font-semibold">3,842</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Failed Matches</span>
                    <span className="font-semibold">78</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Confidence</span>
                    <span className="font-semibold">94.2%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Learning Rate</span>
                    <span className="font-semibold text-[#10b981]">Improving</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </DashboardLayout>
    </div>
  );
}
