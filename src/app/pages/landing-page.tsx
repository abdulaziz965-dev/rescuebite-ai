import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { motion } from "motion/react";
import { 
  Utensils, 
  TrendingDown, 
  Users, 
  ArrowRight, 
  Upload, 
  Sparkles, 
  UserCheck, 
  Truck,
  Heart,
  Target,
  Shield,
  Zap
} from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";

export function LandingPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
    });
    const unsubDonations = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
    });

    return () => {
      unsubUsers();
      unsubDonations();
    };
  }, []);

  const liveMetrics = useMemo(() => {
    const mealsSaved = donations.reduce((sum, donation) => {
      const parsed = parseInt(donation.quantity, 10);
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
    const wasteReducedKg = Math.round(mealsSaved * 0.8);
    const ngosConnected = users.filter((user) => user.role === "receiver").length;
    const claimedCount = donations.filter((donation) => donation.claimed).length;
    const successRate = donations.length > 0 ? Math.round((claimedCount / donations.length) * 100) : 0;
    const todayMatches = donations.filter((donation) => {
      const date = donation.createdAt?.toDate?.();
      if (!date) {
        return false;
      }
      return date.toDateString() === new Date().toDateString();
    }).length;
    return { mealsSaved, wasteReducedKg, ngosConnected, successRate, todayMatches };
  }, [donations, users]);

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
              <Utensils className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold">RescueBite AI</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#platform" className="text-gray-600 hover:text-gray-900 transition-colors">Platform</a>
            <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#impact" className="text-gray-600 hover:text-gray-900 transition-colors">Impact</a>
            <a href="#blog" className="text-gray-600 hover:text-gray-900 transition-colors">Blog</a>
            <Link to="/receiver" className="text-gray-600 hover:text-gray-900 transition-colors">Receiver</Link>
            <Link to="/volunteer" className="text-gray-600 hover:text-gray-900 transition-colors">Volunteer</Link>
          </div>
          
          <Link to="/login">
            <Button className="rounded-full bg-[#10b981] hover:bg-[#047857]">
              Get Started
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#d1fae5] text-[#047857] mb-6">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">AI-Powered Food Rescue</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Transforming Surplus Food into Lifesaving Meals
              </h1>
              
              <p className="text-xl text-gray-600 mb-8">
                Connect food donors, NGOs, shelters, and volunteers through intelligent AI matching to reduce waste and feed communities in need.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link to="/login">
                  <Button size="lg" className="rounded-full bg-[#10b981] hover:bg-[#047857] text-lg px-8">
                    Donate Food
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link to="/receiver">
                  <Button size="lg" variant="outline" className="rounded-full text-lg px-8 border-2">
                    Find Food
                  </Button>
                </Link>
                <Link to="/volunteer">
                  <Button size="lg" variant="outline" className="rounded-full text-lg px-8 border-2">
                    Volunteer
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1593113616828-6f22bca04804?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb29kJTIwZG9uYXRpb24lMjB2b2x1bnRlZXIlMjBjb21tdW5pdHl8ZW58MXx8fHwxNzc2NDE2Mjg5fDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Food rescue community"
                  className="w-full h-[500px] object-cover"
                />
              </div>
              
              {/* Floating metric cards */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="absolute -left-6 top-1/4 bg-white rounded-3xl shadow-xl p-6 max-w-[200px]"
              >
                <div className="text-3xl font-bold text-[#10b981] mb-1">{liveMetrics.todayMatches}</div>
                <div className="text-sm text-gray-600">Meals Saved Today</div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="absolute -right-6 bottom-1/4 bg-white rounded-3xl shadow-xl p-6 max-w-[200px]"
              >
                <div className="text-3xl font-bold text-[#3b82f6] mb-1">{liveMetrics.wasteReducedKg} kg</div>
                <div className="text-sm text-gray-600">Waste Reduced</div>
              </motion.div>
            </motion.div>
          </div>

          {/* Animated Metrics Cards */}
          <div className="grid md:grid-cols-3 gap-6 mt-20">
            {[
              { icon: Utensils, label: "Meals Saved", value: `${liveMetrics.mealsSaved}`, color: "from-[#10b981] to-[#047857]" },
              { icon: TrendingDown, label: "Waste Reduced", value: `${liveMetrics.wasteReducedKg} kg`, color: "from-[#3b82f6] to-[#1d4ed8]" },
              { icon: Users, label: "NGOs Connected", value: `${liveMetrics.ngosConnected}`, color: "from-[#8b5cf6] to-[#6d28d9]" },
            ].map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 + index * 0.1 }}
              >
                <Card className="p-6 rounded-3xl border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${metric.color} flex items-center justify-center mb-4`}>
                    <metric.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-3xl font-bold mb-1">{metric.value}</div>
                  <div className="text-gray-600">{metric.label}</div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-gray-600">Four simple steps to rescue food and save lives</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                icon: Upload,
                title: "Donor Posts Food",
                description: "Restaurants, stores, and individuals post surplus food with details",
                color: "bg-[#10b981]"
              },
              {
                icon: Sparkles,
                title: "AI Smart Matching",
                description: "Our AI matches donations with receivers based on location, urgency, and needs",
                color: "bg-[#3b82f6]"
              },
              {
                icon: UserCheck,
                title: "Receiver Claims",
                description: "NGOs, shelters, and individuals claim food through the platform",
                color: "bg-[#8b5cf6]"
              },
              {
                icon: Truck,
                title: "Delivered Fast",
                description: "Volunteers deliver food quickly with optimized routes",
                color: "bg-[#f97316]"
              },
            ].map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="p-8 rounded-3xl border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-2 h-full">
                  <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center mb-6`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-2xl font-bold mb-3">{step.title}</div>
                  <p className="text-gray-600">{step.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Trusted by Communities</h2>
            <p className="text-xl text-gray-600">Hear from our partners making a difference</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "RescueBite AI has transformed how we distribute surplus food. The AI matching is incredibly accurate!",
                author: "Sarah Johnson",
                role: "Director, Hope Kitchen NGO",
                image: "https://images.unsplash.com/photo-1758599668209-783bd3691ec8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMHZvbHVudGVlciUyMHNtaWxpbmclMjBoZWxwaW5nfGVufDF8fHx8MTc3NjQxNjI5MHww&ixlib=rb-4.1.0&q=80&w=1080"
              },
              {
                quote: "As a restaurant owner, I love knowing my surplus food goes to those who need it most instead of waste.",
                author: "Michael Chen",
                role: "Owner, Green Garden Restaurant",
                image: "https://images.unsplash.com/photo-1764714609785-bbb7c52ba509?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb29kJTIwZGVsaXZlcnklMjBwZXJzb24lMjBjYXJyeWluZ3xlbnwxfHx8fDE3NzY0MTYyOTB8MA&ixlib=rb-4.1.0&q=80&w=1080"
              },
              {
                quote: "The platform makes volunteering seamless. I can help deliver food on my schedule and see real impact.",
                author: "Emma Rodriguez",
                role: "Volunteer Coordinator",
                image: "https://images.unsplash.com/photo-1759003103614-11427d946af0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMHZlZ2V0YWJsZXMlMjBoZWFsdGh5JTIwZm9vZCUyMGJhc2tldHxlbnwxfHx8fDE3NzY0MTYyODl8MA&ixlib=rb-4.1.0&q=80&w=1080"
              },
            ].map((testimonial, index) => (
              <motion.div
                key={testimonial.author}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="p-8 rounded-3xl border-0 shadow-lg hover:shadow-xl transition-shadow h-full">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden">
                      <ImageWithFallback
                        src={testimonial.image}
                        alt={testimonial.author}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-lg">{testimonial.author}</div>
                      <div className="text-sm text-gray-600">{testimonial.role}</div>
                    </div>
                  </div>
                  <p className="text-gray-700 italic">"{testimonial.quote}"</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact Section */}
      <section id="impact" className="py-20 bg-gradient-to-br from-[#10b981] to-[#3b82f6] text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-4">Our Global Impact</h2>
          <p className="text-xl opacity-90 mb-12">Making a difference, one meal at a time</p>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Heart, value: `${liveMetrics.mealsSaved}`, label: "Lives Impacted" },
              { icon: Target, value: `${liveMetrics.wasteReducedKg} kg`, label: "CO₂ Prevented" },
              { icon: Shield, value: `${liveMetrics.ngosConnected}`, label: "Partner NGOs" },
              { icon: Zap, value: `${liveMetrics.successRate}%`, label: "Match Success" },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="bg-white/10 backdrop-blur-sm rounded-3xl p-8"
              >
                <stat.icon className="w-12 h-12 mx-auto mb-4" />
                <div className="text-4xl font-bold mb-2">{stat.value}</div>
                <div className="text-lg opacity-90">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3b82f6] flex items-center justify-center">
                  <Utensils className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-semibold">RescueBite AI</span>
              </div>
              <p className="text-gray-400">Transforming surplus food into lifesaving meals through AI-powered matching.</p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/donor" className="hover:text-white transition-colors">For Donors</Link></li>
                <li><Link to="/receiver" className="hover:text-white transition-colors">For Receivers</Link></li>
                <li><Link to="/volunteer" className="hover:text-white transition-colors">For Volunteers</Link></li>
                <li><Link to="/receiver" className="hover:text-white transition-colors">For NGOs</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Impact Report</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Docs</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2026 RescueBite AI. All rights reserved. Making the world waste-free, one meal at a time.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
