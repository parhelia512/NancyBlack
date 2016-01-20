﻿using Nancy;
using NantCom.NancyBlack.Configuration;
using NantCom.NancyBlack.Modules.CommerceSystem.types;
using NantCom.NancyBlack.Modules.ContentSystem.Types;
using NantCom.NancyBlack.Modules.DatabaseSystem;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.Caching;
using System.Web;

namespace NantCom.NancyBlack.Modules.CommerceSystem
{
    public class CommerceAdminModule : BaseModule
    {
        public CommerceAdminModule()
        {
            Get["/admin/tables/saleorder"] = this.HandleViewRequest("/Admin/saleordermanager", null);
            Get["/admin/tables/product"] = this.HandleViewRequest("/Admin/productmanager", null);

            Get["/admin/commerce/settings"] = this.HandleViewRequest("/Admin/commerceadmin-settings", null);

            Post["/admin/commerce/api/uploadlogo"] = this.HandleRequest((arg) =>
            {
                var file = this.Request.Files.First();
                var filePath = "Site/billinglogo" + Path.GetExtension(file.Name);
                using (var localFile = File.OpenWrite(Path.Combine(this.RootPath, filePath)))
                {
                    file.Value.CopyTo(localFile);
                }

                return "/" + filePath;
            });

            Get["/admin/tables/saleorder/{id}"] = this.HandleRequest(this.HandleSaleorderDetailPage);

            Get["/admin/saleorder/{id}/add/{productId}"] = this.HandleRequest((arg) =>
            {
                if (!this.CurrentUser.HasClaim("admin"))
                {
                    return 403;
                }

                var so = this.SiteDatabase.GetById<SaleOrder>((int)arg.id);

                var product = this.SiteDatabase.GetById<Product>((int)arg.productId);
                if (product == null)
                {
                    return 400;
                }

                so.Items = so.Items.Concat(new int[] { (int)arg.productId }).ToArray();
                so.UpdateSaleOrder(this.SiteDatabase);

                return 200;
            });


            Get["/admin/saleorder/{id}/remove/{productId}"] = this.HandleRequest((arg) =>
            {
                if (!this.CurrentUser.HasClaim("admin"))
                {
                    return 403;
                }

                var so = this.SiteDatabase.GetById<SaleOrder>((int)arg.id);

                var product = this.SiteDatabase.GetById<Product>((int)arg.productId);
                if (product == null)
                {
                    return 400;
                }

                var items = so.Items.ToList();
                items.Remove((int)arg.ProductId);

                so.Items = items.ToArray();
                so.UpdateSaleOrder(this.SiteDatabase);

                return 200;
            });

            Get["/admin/commerce/api/exchangerate"] = this.HandleRequest(this.GetExchangeRate);

            Get["/admin/commerce/api/sostatus"] = this.HandleRequest(this.GetSaleorderStatusList);

            Get["/admin/commerce/api/paymentstatus"] = this.HandleRequest(this.GetPaymentStatusList);

            Patch["/tables/product/{id:int}"] = this.HandleRequest(this.HandleProductSave);

            Post["/admin/commerce/api/pay"] = this.HandleRequest(this.HandlePayRequest);

            #region Quick Actions

            Post["/admin/commerce/api/enablesizing"] = this.HandleRequest(this.EnableSizingVariations);

            #endregion

            //Post["/admin/reset/receivenumber"] = this.HandleRequest(this.ResetReceiveNumber);
        }

        private dynamic HandlePayRequest(dynamic arg)
        {
            if (!this.CurrentUser.HasClaim("admin"))
            {
                return 403;
            }

            var param = ((JObject)arg.body.Value);

            DateTime paidWhen = param.Value<DateTime>("paidWhen");
            string soIdentifier = param.Value<string>("saleOrderIdentifier");

            var paymentLog = new PaymentLog()
            {
                PaymentSource = param.Value<string>("paymentMethod"),
                Amount = param.Value<decimal>("amount"),
                IsErrorCode = false,
                ResponseCode = "00",
                IsPaymentSuccess = true,
                SaleOrderIdentifier = soIdentifier
            };

            CommerceModule.HandlePayment(this.SiteDatabase, paymentLog, paidWhen);

            return paymentLog;

        }

        private dynamic ResetReceiveNumber(dynamic arg)
        {
            if (!this.CurrentUser.HasClaim("admin"))
            {
                return 403;
            }

            var index = this.SiteDatabase.Query<Index>().Where(i => i.Type == "Recieve").FirstOrDefault();

            if (index == null)
            {
                index = new Index
                {
                    Type = "Recieve",
                    Value = 0
                };
            }
            else
            {
                // incase really wanna reset
                index.Value = 0;
            }

            var paidSaleOrders = this.SiteDatabase.Query<SaleOrder>()
                .Where(s => s.ReceiptIdentifier != null)
                .OrderBy(s => s.PaymentReceivedDate)
                .ThenBy(s => s.SaleOrderIdentifier)
                .ToList().Where(s => s.ReceiptIdentifier[0] != 'X');

            foreach (var saleOrder in paidSaleOrders)
            {
                index.Value++;
                var year = saleOrder.ReceiptIdentifier.Substring(2, 4);
                if (saleOrder.PaymentReceivedDate.Ticks != 0)
                {
                    year = saleOrder.PaymentReceivedDate.Year.ToString();
                }
                saleOrder.ReceiptIdentifier = string.Format(CultureInfo.InvariantCulture,
                        "RC{0}-{1:000000}", year, index.Value);

                this.SiteDatabase.UpsertRecord<SaleOrder>(saleOrder);
            }

            this.SiteDatabase.UpsertRecord<Index>(index);

            return 200;
        }

        private dynamic HandleSaleorderDetailPage(dynamic arg)
        {
            if (!this.CurrentUser.HasClaim("admin"))
            {
                return 403;
            }

            var id = (int)arg.id;
            var so = this.SiteDatabase.GetById<SaleOrder>(id);

            var dummyPage = new Page();

            var data = new
            {
                SaleOrder = so,
                PaymentLogs = so.GetPaymentLogs(this.SiteDatabase),
                RowVerions = so.GetRowVersions(this.SiteDatabase),
                PaymentMethods = StatusList.GetAllStatus<PaymentMethod>()
            };

            return View["/Admin/saleorderdetailmanager", new StandardModel(this, dummyPage, data)];
        }

        private dynamic GetSaleorderStatusList(dynamic arg)
        {
            SaleOrderStatus SOStatus = new SaleOrderStatus();

            var SOStatusList = SOStatus.GetType().GetMembers()
                .Where(w => w.MemberType == System.Reflection.MemberTypes.Field)
                .Select(s => new { title = s.Name })
                .ToList();

            return SOStatusList;
        }

        private dynamic GetPaymentStatusList(dynamic arg)
        {
            PaymentStatus paymentStatus = new PaymentStatus();

            var paymentStatusList = paymentStatus.GetType().GetMembers()
                .Where(w => w.MemberType == System.Reflection.MemberTypes.Field)
                .Select(s => new { title = s.Name })
                .ToList();

            return paymentStatusList;
        }

        private dynamic EnableSizingVariations(dynamic arg)
        {
            TableSecModule.ThrowIfNoPermission(this.Context, "Product", TableSecModule.PERMISSON_UPDATE);

            var sizes = (string)arg.body.Value.choices;

            this.SiteDatabase.Transaction(() =>
            {
                foreach (var item in this.SiteDatabase.Query<Product>()
                                        .Where(p => p.IsVariation == false)
                                        .AsEnumerable())
                {
                    item.HasVariation = true;
                    item.VariationAttributes = JArray.FromObject(new[] { new
                    {
                        Name = "Size",
                        Choices = sizes
                    }});

                    this.HandleProductSave(JObject.FromObject(new
                    {
                        body = new
                        {
                            Value = item
                        }
                    }));
                }
            });

            return 200;
        }

        private dynamic HandleProductSave(dynamic arg)
        {
            TableSecModule.ThrowIfNoPermission(this.Context, "Product", TableSecModule.PERMISSON_UPDATE);


            var input = arg.body.Value as JObject;
            var product = input.ToObject<Product>();

            var dupe = this.SiteDatabase.Query<Product>()
                .Where(p => p.Url == product.Url)
                .FirstOrDefault();

            if (dupe != null && dupe.Id != product.Id)
            {
                throw new InvalidOperationException("Duplicate Url");
            }

            if (product.HasVariation == false)
            {
                this.SiteDatabase.UpsertRecord<Product>(product);
            }

            var attributes = product.VariationAttributes as JArray;
            if (attributes == null)
            {
                this.SiteDatabase.UpsertRecord<Product>(product);
                return product;
            }


            // handle generation of product variation
            this.SiteDatabase.Transaction(() =>
            {
                List<string[]> variations = new List<string[]>();
                foreach (JObject prop in attributes)
                {
                    var choices = from item in prop["Choices"].ToString().Split(',')
                                  select item.Trim();

                    variations.Add(choices.ToArray());
                }

                Action<string> createProduct = (url) =>
                {
                    var newUrl = (product.Url + url).ToLowerInvariant();

                    // copy all information from current product to replace the variation product
                    var newProduct = JObject.FromObject(product).ToObject<Product>();
                    var existingProduct = this.SiteDatabase.Query<Product>()
                                        .Where(p => p.Url == newUrl)
                                        .FirstOrDefault();

                    if (existingProduct == null)
                    {
                        newProduct.Id = 0;
                    }
                    else
                    {
                        newProduct.Id = existingProduct.Id;
                    }

                    newProduct.MasterProductId = product.Id;
                    newProduct.IsVariation = true;
                    newProduct.HasVariation = false;
                    newProduct.VariationAttributes = null;
                    newProduct.Url = newUrl;

                    var parts = url.Split(new char[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
                    var newProductAttributes = new JObject();

                    for (int i = 0; i < attributes.Count; i++)
                    {
                        newProductAttributes[attributes[i]["Name"].ToString()] = parts[i];
                    }

                    newProduct.Title += " (Variation:" + url + ")";
                    newProduct.Attributes = newProductAttributes;
                    this.SiteDatabase.UpsertRecord<Product>(newProduct);

                };

                Action<string, int> dig = null;
                dig = (baseUrl, index) =>
                {
                    foreach (var choice in variations[index])
                    {
                        var currentUrl = baseUrl + "/" + choice;

                        if (index + 1 == variations.Count)
                        {
                            createProduct(currentUrl);
                        }
                        else
                        {
                            dig(currentUrl, index + 1);
                        }

                    }
                };

                dig("", 0);
                this.SiteDatabase.UpsertRecord<Product>(product);
            });

            return product;
        }

        private dynamic GetExchangeRate(dynamic arg)
        {
            byte[] cached = MemoryCache.Default["ExchangeRates"] as byte[];
            if (cached == null)
            {
                WebClient client = new WebClient();
                cached = client.DownloadData("https://openexchangerates.org/api/latest.json?app_id=8ecf50d998af4c2f837bfa416698784e");
                client.Dispose();

                MemoryCache.Default.Add("ExchangeRates", cached, DateTimeOffset.Now.AddMinutes(60));
            }

            var response = new Response();
            response.Contents = (s) =>
            {
                s.Write(cached, 0, cached.Length);
            };

            return response;

        }
    }
}