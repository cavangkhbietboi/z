const pool = require("../models/pool");
const fs = require('fs');
const express = require('express');
const path = require('path'); 

const bcrypt = require("bcrypt");
const saltRound = 10;
const encodeToken = require("../../util/encodeToken");
const CronJob = require('cron').CronJob;
const io = require("socket.io-client");
const job = [];

class API {

    // [POST] /api
    index(req, res, next) {

    }

    // [POST] /api/register
    register(req, res, next) {
        const insertSql = "insert into taikhoan (Ho, Ten, Email, TenDN, MatKhau) value (?,?,?,?,?)";
        const selectSql = "select Email from taikhoan where Email = ?";
        const messEmail = "Email đã được dùng để đăng kí tài khoản. Vui lòng chọn quên mật khẩu!";

        const Ho = req.body.Ho;
        const Ten = req.body.Ten;
        const Email = req.body.Email;
        const TenDN = req.body.TenDN;
        const MatKhau = req.body.MatKhau;
        const CFMatKhau = req.body.CFMatKhau;

        if(CFMatKhau !== MatKhau){
            res.status(200).send({ message: "Mật khẩu xác nhận không khớp!" });
        } else {
            bcrypt.hash(MatKhau, saltRound, (err, hash) => {
                if (err) {
                    res.status(200).send({ message: "Mật khẩu không được mã hóa" });
                }
                console.log('hash:', hash, Ho, Ten, TenDN, Email);
                pool.getConnection(function (err, connection) {
                    if (err) throw err; // not connected!
    
                    // Use the connection
                    connection.query(selectSql, Email, function (error, results, fields) {
                        if (error) {
                            res.status(200).send({ message: "Kết nối DataBase thất bại" });
                        } else {
                            if (results.length > 0) {
                                res.status(200).send({ message: messEmail });
                            } else {
                            connection.query(
                                insertSql,
                                [Ho, Ten, Email, TenDN, hash],
                                function (error, results, fields) {
                                    if (error) {
                                        res
                                        .status(200)
                                        .send({ message: "Kết nối DataBase thất bại, lỗi cú pháp" });
                                    } else {
                                        res.send(results);
                                    }
                                }
                            );
                            }
                            connection.release();
                        }
                    });            
                });
            });
        }
    }

    // [GET] /api/isAuth
    isAuth(req, res, next) {
        const PQ =  req.user[0].PhanQuyen;

        res.status(200).send({ isAuth: true, PQ: PQ });
 
       
    }

    // [POST] /api/login
    login(req, res, next) {

        const sql = "select * from taikhoan where Email = ? ";
        const Email = req.body.Email;
        const MatKhau = req.body.MatKhau;

        pool.query(sql, Email, function (error, results, fields) {
            if (error) {
                res.send({ error: error });
            }
            if (results.length > 0) {
                bcrypt.compare(MatKhau, results[0].MatKhau, (err, response) => {
                    if (response) {
                        const payload = {
                        iss: "grey panther auction site",
                        idTK: results[0].idTK,
                        TenDN: results[0].TenDN,
                        PhanQuyen: results[0].PhanQuyen,
                        };
                        const token = "Bearer " + encodeToken(payload);
                        res.setHeader("isAuth", token);

                        res.send({ isAuth: response, TenDN: results[0].TenDN, PQ: results[0].PhanQuyen});
                    } else {
                        res
                        .status(200)
                        .send({ message: "Tên Đăng Nhập hoặc mật khẩu không đúng!" });
                    }
                });
            } else {
                res.status(200).send({ message: "Tài khoản không tồn tại!" });
            }
        });
    }

    // [GET] /api/logout
    logout(req, res, next){
        res.clearCookie("userAuth", { path: "/" });
        res.clearCookie("username", { path: "/" });
        res.status(200).json({ success: true, message: "User logged out successfully" });
    };
  
    // [GET] /api/get/user
    user(req, res, next) {
        const idTK =  req.user[0].idTK;
        const selectSql = "select * from taikhoan where idTK = ?";

        pool.query(selectSql, idTK, function (error, results, fields) {
            if (error) {
                res.send({
                    message: "Cập nhật thông tin không thành công"
                });
            } else {
                res.send({
                    Ten: results[0].Ten,
                    Ho: results[0].Ho,
                    NgaySinh: results[0].NgaySinh,
                    Email: results[0].Email,
                    SDT: results[0].SDT,
                    Avt: results[0].Avt,
                    message: "Cập nhật thông tin thành công"
                });
            }
        });
    }

    // [PATCH] /api/update/password
    updatePassword(req, res, next) {
       
        const idTK =  req.user[0].idTK;

        const updateSql = "update taikhoan set MatKhau = ? where idTK = ?";
        const selectSql = "select MatKhau from taikhoan where idTK = ?";
        const MkCu = req.body.MkCu;
        const MkMoi = req.body.MkMoi;

        pool.getConnection(function (err, connection) {
            if (err) throw err; // not connected!
            connection.query(selectSql, idTK, function (error, results, fields) {
                if (error) {
                    res.send({  message: "Kết nối DataBase thất bại"  });
                }
                if (results.length > 0) {
                    bcrypt.compare(MkCu, results[0].MatKhau, (err, response) => {
                        if (response) {
                            bcrypt.hash(MkMoi, saltRound, (err, hash) => {
                                connection.query(updateSql, [hash, idTK], function (err, results, fields) {
                                    if (err) {
                                        res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                                    } else {
                                        res.send({message: "Đổi mật khẩu thành công!"});
                                    }
                                })
                                connection.release();
                            });
                        } else {
                            res.status(200).send({ message: "Mật khẩu cũ không đúng!" });
                        }
                    });
                } else { 
                    res.status(200).send({isAuth: false});
                }
            });            
        });
    }

    // [PATCH] /api/update/profile
    updateProfile(req, res, next){     

        const updateSql = "update taikhoan set Ho = ? , Ten = ?, TenDN = ? , NgaySinh = ?, SDT = ? where idTK = ?";

        const idTK =  req.user[0].idTK;
        const   Ho = req.body.ho, 
                Ten = req.body.ten, 
                TenDN = req.body.tenDN,     
                NgaySinh = req.body.ngaySinh ? req.body.ngaySinh: "",
                SDT = req.body.sDT ? req.body.sDT : "";
        pool.query(updateSql, [Ho, Ten, TenDN, NgaySinh, SDT, idTK], function (err, results, fields) {
            if (err) {
                res.status(200).send({  message: "Kết nối DataBase thất bại"  });
            } else { 
                if(results){
                    res.send({message: "Cập nhật thông tin thành công"});
                } else { 
                    res.send({message: "Cập nhật thông tin thất bại, lỗi cú pháp!"});
                }
            }
        });     
    }

    // [POST] /api/stored/avatar
    storedAvatar(req, res, next){

        const updateSql = "update taikhoan set Avt = ? where idTK = ?";
        const selectSql = "select * from taikhoan where idTK = ?";
        const idTK =  req.user[0].idTK;  console.log(req.file)
        const Avt = "image" + "/" + "AVT" + "/" + req.file.filename; 
        const basePath = path.join(__dirname, '../../../../client','public');

        pool.getConnection(function (err, connection) {
            if (err) throw err; // not connected!

            // Use the connection
            connection.query(selectSql, idTK, function (error, results, fields) {
                if (error) {
                    res.status(200).send({ message: "Kết nối DataBase thất bại" });
                } else {
                    const filePath = basePath + "/" + results[0].Avt; 
                    
                    
                    connection.query(updateSql, [Avt, idTK], function (err, rs, fields) {
                        if (err) {
                            res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                        } else { 
                            if(rs){
                                if(results[0].Avt === "" || results[0].Avt === null || results[0].Avt ==='undefined'){
                                    res.send({message: "Cập nhật ảnh đại diện thành công"});
                                } else {
                                    fs.unlink(filePath, function (err) {
                                        if (err) throw err;
                                        //console.log('ảnh đại diện cũ đã bị xóa!');
                                    });
                                    res.send({message: "Cập nhật ảnh đại diện thành công, dữ liệu cũ đã bị xóa!"});
                                }                               
                            } else { 
                                res.send({message: "Cập nhật ảnh đại diện thất bại, lỗi cú pháp!"});
                            }
                        }
                    })
                    
                    connection.release();
                }
            });            
        });
    }

    // [PATCH] /api/delete/avatar
    deleteAvatar(req, res, next) {
        const updateSql = "update taikhoan set Avt = '' where idTK = ?";
        const selectSql = "select * from taikhoan where idTK = ?";
        const idTK =  req.user[0].idTK;  
        const basePath = path.join(__dirname, '../../../../client','public');

        pool.getConnection(function (err, connection) {
            if (err) throw err; // not connected!

            // Use the connection
            connection.query(selectSql, idTK, function (error, results, fields) {
                if (error) {
                    res.status(200).send({ message: "Kết nối DataBase thất bại" });
                } else {
                    const filePath = basePath + "/" + results[0].Avt; 
                    connection.query(updateSql, idTK, function (err, rs, fields) {
                        if (err) {
                            res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                        } else { 
                            if(rs){
                                if(results[0].Avt === "" || results[0].Avt === null || results[0].Avt ==='undefined'){
                                    res.send({message: "Bạn chưa đặt ảnh đại diện"});
                                } else {
                                    fs.unlink(filePath, function (err) {
                                        if (err) throw err;
                                        //console.log('ảnh đại diện cũ đã bị xóa!');
                                    });
                                    res.send({message: "Đã xóa ảnh đại diện!"});
                                }                             
                            } else { 
                                res.send({message: "Xóa ảnh đại diện thất bại, lỗi cú pháp!"});
                            }
                        }
                    })
                    
                    connection.release();
                }
            });            
        });
    }

    // [GET] /api/admin/get/product
    getProduct(req, res, next){
        const selectSql = "select * from sanpham";

        const PQ =  req.user[0].PhanQuyen;

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để thêm ảnh cho SP này!"})
        } else {
            pool.query(selectSql, function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send(results);
                    } else { 
                        res.send({check: "Không thể lấy dữ liệu"});
                    }
                }
            });
        }
    }

    // [POST] /api/admin/stored/img/product
    storedImgProduct(req, res, next){
        const updateSql = "update sanpham set HinhAnh = ? where idSP = ?";
        const selectSql = "select * from sanpham where idSP = ?"

        const HinhAnh = "image" + "/" + "BANNER" + "/" + req.file.filename; 
        const basePath = path.join(__dirname, '../../../../client','public');

        const PQ =  req.user[0].PhanQuyen;
        const idSP = req.body.idSP;

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để thêm ảnh cho SP này!"})
        } else {
            pool.getConnection(function (err, connection) {
                if (err) throw err; // not connected!
    
                // Use the connection
                connection.query(selectSql, idTK, function (error, results, fields) {
                    if (error) {
                        res.status(200).send({ message: "Kết nối DataBase thất bại" });
                    } else {
                        const filePath = basePath + "/" + results[0].Avt; 
                        
                        connection.query(updateSql, [HinhAnh, idSP], function (err, rs, fields) {
                            if (err) {
                                res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                            } else { 
                                if(rs){
                                    if(results[0].Avt === "" || results[0].Avt === null || results[0].Avt ==='undefined'){    
                                    } else {
                                        fs.unlink(filePath, function (err) {
                                            if (err) throw err;
                                            console.log('ảnh đại diện cũ đã bị xóa!');
                                        });
                                    }
                                    res.send({check: "Thêm ảnh cho SP thành công"});
                                } else { 
                                    res.send({check: "Thêm ảnh cho SP thất bại, lỗi cú pháp!"});
                                }
                            }
                        });
           
                        
                        connection.release();
                    }
                });            
            });
        }
    }

    // [POST] /api/admin/stored/product
    storedProduct(req, res, next){
        const insertSql = "insert into sanpham ( Website, ViTri, KichThuoc, Gia, MoTa) values (?, ?, ?, ?, ?)";
        
        const PQ =  req.user[0].PhanQuyen; 
        const   Website = req.body.Website,      
                ViTri = req.body.ViTri, 
                KichThuoc = req.body.KichThuoc, 
                Gia = req.body.Gia, 
                MoTa = req.body.MoTa

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để lưu trữ SP này!"})
        } else {
            pool.query(insertSql, [Website, ViTri, KichThuoc, Gia, MoTa], function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send({check: "Thêm SP thành công"});
                    } else { 
                        res.send({check: "Thêm SP thất bại, lỗi cú pháp!"});
                    }
                }
            });
        }      
    }

    // [PATCH] /api/admin/update/product
    updateProduct(req, res, next){
        const updateSql = "update sanpham set Website = ?, ViTri = ?, Gia = ?, MoTa = ? where idSP = ?";
        
        const PQ =  req.user[0].PhanQuyen; 
        const   Website = req.body.Website,      
                ViTri = req.body.ViTri, 
                Gia = req.body.Gia, 
                MoTa = req.body.MoTa,
                idSP = req.body.idSP

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để chỉnh sửa nội dung SP này!"})
        } else {
            pool.query(updateSql, [Website, ViTri, Gia, MoTa, idSP], function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send({check: "Cập nhật SP thành công"});
                    } else { 
                        res.send({check: "Cập nhật SP thất bại, lỗi cú pháp!"});
                    }
                }
            });  
        }   
    }

    // [DELETE] /api/admin/delete/product
    deleteProduct(req, res, next){
        const deleteSql = "delete from sanpham where idSP = ?";
        
        const PQ =  req.user[0].PhanQuyen; 
        const   idSP = req.body.idSP;

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để xóa SP này!"})
        } else {
            pool.query(deleteSql, idSP, function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send({check: "Xóa SP thành công"});
                    } else { 
                        res.send({check: "Xóa SP thất bại, lỗi cú pháp!"});
                    }
                }
            });
        }      
    }

    // [POST] /api/admin/stored/auction
    storedAuction(req, res, next){
        const insertSql = "insert into daugia (idSP, TgBatDau, TgDauGia, GiaKhoiDiem, TrangThai, BuocGia) values (?, ?,?,?,?,?)";
        
        const PQ =  req.user[0].PhanQuyen;   
        const   idSP = req.body.idSP, 
                TgBatDau = req.body.TgBatDau, 
                TgDauGia = req.body.TgDauGia     
                GiaKhoiDiem = req.body.GiaKhoiDiem, 
                TrangThai = req.body.TrangThai, 
                BuocGia = req.body.BuocGia

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để thêm game ĐG này!"})
        } else {
            pool.query(insertSql, [idSP, TgBatDau, TgDauGia, GiaKhoiDiem, TrangThai, BuocGia], function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send({check: "Thêm game ĐG thành công"});
                    } else { 
                        res.send({check: "Thêm game ĐG thất bại, lỗi cú pháp!"});
                    }
                }
            });
        }      
    }

    // [PATCH] /api/admin/update/auction
    updateAuction(req, res, next){
        const updateSql = "update daugia set idSP = ?, TgBatDau = ?, TgDauGia = ?, GiaKhoiDiem = ?, TrangThai = ?,BuocGia=? where idDG = ?";
     
        const PQ =  req.user[0].PhanQuyen;       
        const   idSP = req.body.idSP, 
                TgBatDau = req.body.TgBatDau, 
                TgDauGia = req.body.TgDauGia     
                GiaKhoiDiem = req.body.GiaKhoiDiem, 
                TrangThai = req.body.TrangThai, 
                BuocGia = req.body.BuocGia,
                idDG = req.body.idDG;

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để chỉnh sửa game ĐG này!"})
        } else {
            pool.query(updateSql, [idSP, TgBatDau, TgDauGia, GiaKhoiDiem, TrangThai, BuocGia, idDG], function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send({check: "Cập nhật game ĐG thành công"});
                    } else { 
                        res.send({check: "Cập nhật game ĐG thất bại, lỗi cú pháp!"});
                    }
                }
            });
        }      
    }

    // [DELETE] /api/admin/delete/auction
    deleteProduct(req, res, next){
        const deleteSql = "delete from daugia where idDG = ?";
        
        const PQ =  req.user[0].PhanQuyen; 
        const idDG = req.body.idDG

        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để xóa game ĐG này!"})
        } else {
            pool.query(deleteSql, idDG, function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        res.send({check: "Xóa game ĐG thành công"});
                    } else { 
                        res.send({check: "Xóa game ĐG thất bại, lỗi cú pháp!"});
                    }
                }
            });
        }       
    }

    // [POST] /api/admin/auction/settimer
    setTimer(req, res, next) { 
        const sql = "update daugia set TrangThai = '1' where idDG = ?";
        const PQ =  req.user[0].PhanQuyen;
        if(PQ === 0){
            res.send({message: "Bạn chưa được cấp quyền admin để sắp dặt thời gian đấu giá!"})
        } else {
            const idDG = req.body.idDG;
            const TgBatDau = req.body.TgBatDau; //2021-11-21 00:00:00
            const TgDauGia = parseInt(req.body.TgDauGia) * 60;    

            const getDate = TgBatDau.split(' ')[0].split('-');
            const getTime = TgBatDau.split(' ')[1].split(':');
            const y = parseInt(getDate[0]);
            const m = (parseInt(getDate[1]) - 1);
            const d = parseInt(getDate[2]);
            const h = parseInt(getTime[0]);
            const mi = parseInt(getTime[1]);
            const s = parseInt(getTime[2]);

            const date = new Date(y, m, d, h, mi, s);

            job[parseInt(idDG)] = new CronJob(date, function() {  
                pool.query(sql, idDG, function (error, results, fields) {
                    console.log('Thay đổi trạng thái game đấu qua đang diễn ra');
                });
                //console.log('Đấu giá bắt đầu')
                const socket = io.connect("http://localhost:4000");
                
                socket.emit('settimer', {room: idDG, time: TgDauGia});
                setTimeout( () => {  
                    socket.emit("leave_room", idDG);
                }, 2000);
            }, null, true);
            res.send({message: "Đã lên lịch cho game đấu giá này!"});
        }
    }


    // [GET] /api/get/all/auction
    getAuction(req, res, next){
        const selectSql0 = "select * from sanpham s, daugia d where s.idSP = d.idSP and TrangThai = '0'";
        const selectSql1 = "select * from sanpham s, daugia d where s.idSP = d.idSP and TrangThai = '1'";

        pool.getConnection(function (err, connection) {
            if (err) throw err; // not connected!
            connection.query(selectSql0, function (err, results, fields) {
                if (err) {
                    res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                } else { 
                    if(results){
                        connection.query(selectSql1, function (err, rs, fields) {
                            if (err) {
                                res.status(200).send({  message: "Kết nối DataBase thất bại"  });
                            } else { 
            
                                if(rs){
                                    res.send({isComing: results, isHappening: rs});
                                } else { 
                                    res.send({message: "Lấy phiên đấu giá thất bại, lỗi cú pháp!"});
                                }
                            }
                        });
                    } else { 
                        res.send({message: "Lấy phiên đấu giá thất bại, lỗi cú pháp!"});
                    }
                }
            });
            connection.release();
        });
    }

    // [GET] /api/auction/info
    auctionInfo(req, res, next){
        
        const sql = "select * from sanpham s, daugia d where s.idSP = d.idSP and idDG = ? ";
        const idDG = req.query.id;

        pool.query(sql, idDG, function (error, results, fields) {
            if (error) {
                res.send({ error: error });
            }
            if (results.length > 0) {
                res.send({  
                    highestPrice: results[0].GiaKhoiDiem, 
                    priceStep: results[0].BuocGia,
                    website: results[0].Website,
                    position: results[0].ViTri,
                    bannerSize: results[0].KichThuoc,
                    urlImage: results[0].HinhAnh,
                    dateTime: results[0].TgBatDau,
                    decription: results[0].MoTa
                });           
            } else {
                res.status(200).send({ message: "Sàn đấu giá không tồn tại!" });
            }
        });
    }

    // [GET] /api/get/auction/iscoming
    getComingAuction(req, res, next) {
        const selectSql0 = "select * from sanpham s, daugia d where s.idSP = d.idSP and TrangThai = '0'";
        pool.query(selectSql0, function (err, results, fields) {
            if (err) {
                res.status(200).send({  message: "Kết nối DataBase thất bại"  });
            } else { 
                if(results){                 
                     res.send({isComing: results});              
                } else { 
                    res.send({message: "Lấy phiên đấu giá thất bại, lỗi cú pháp!"});
                }
            }
        });
    }
   
    //[POST] /api/auction/loved
    auctionLoved(req, res, next){
        const idTK =  req.user[0].idTK;  
        const idDG = req.body.idDG;
        const sql = 'insert into quantam (idTK, idDG) values (?, ?)';
        pool.query(sql, [idTK, idDG], function (error, results, fields) {
            if (error) {
                res.status(200).send({ message: "Sàn đấu giá không tồn tại!" });
            }
            res.status(200).send({ message: "Đã thêm vào quan tâm!" });
        });
    }
}

module.exports = new API();
